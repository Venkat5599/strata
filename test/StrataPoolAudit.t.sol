// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {StrataTypes} from "../contracts/StrataResolver.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";
import {MockAToken, MockAPass, MockPolicy} from "./StrataPool.t.sol";

/// @title StrataPoolAuditTest
/// @notice Regression tests for the findings raised in the security audit.
///
/// @dev Each test here fails against the contract as it stood before the corresponding fix.
///      They exist so a future refactor cannot quietly reopen a hole that was closed once -
///      a fix without a test is a fix with an expiry date.
///
///      Findings covered:
///        F1 HIGH   syncStratum was a permissionless griefing vector
///        F2 HIGH   settlement coupled to caller balance while entitlement came from lots
///        F3 MEDIUM deferredShares accumulated instead of reporting the outstanding amount
///        F4 MEDIUM previewExit disagreed with withdraw after late verification
contract StrataPoolAuditTest is Test {
    MockAToken internal token;
    MockAToken internal aToken;
    MockAPass internal passRegistry;
    MockPolicy internal policyMock;
    StrataPool internal pool;

    address internal owner = address(0xA11CE);
    address internal verifiedLp = address(0xBEEF);
    address internal openLp = address(0xCAFE);
    address internal griefer = address(0xBAD);

    uint256 internal constant ONE = 1e6;

    uint8 internal OPEN_ID;
    uint8 internal VERIFIED_ID;

    function setUp() public {
        token = new MockAToken();
        aToken = new MockAToken();
        passRegistry = new MockAPass();
        policyMock = new MockPolicy(passRegistry);
        policyMock.registerToken(address(aToken));

        pool = new StrataPool(
            IERC20(address(token)), IERC20(address(aToken)), ICleanversePolicy(address(policyMock)), owner
        );

        passRegistry.issue(verifiedLp, 1001);
        token.mint(verifiedLp, 1_000 * ONE);
        token.mint(openLp, 1_000 * ONE);

        vm.prank(verifiedLp);
        token.approve(address(pool), type(uint256).max);
        vm.prank(openLp);
        token.approve(address(pool), type(uint256).max);

        OPEN_ID = pool.STRATUM_OPEN();
        VERIFIED_ID = pool.STRATUM_VERIFIED();
    }

    // ---------------------------------------------------------------------
    // F1 - HIGH - permissionless griefing of a whole stratum
    // ---------------------------------------------------------------------

    /// @notice A stranger cannot block a stratum for everyone else.
    /// @dev syncStratum used to take an arbitrary probe address and block the stratum when
    ///      that probe was frozen, so anyone could halt every redemption from it and drive
    ///      price() to zero simply by naming a frozen address. It now reads only asset-level
    ///      pause state, which no caller controls.
    function test_F1_strangerCannotGriefStratumIntoBlocked() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        policyMock.setFrozen(griefer, true);

        vm.prank(griefer);
        pool.syncStratum(VERIFIED_ID);

        assertFalse(pool.stratum(VERIFIED_ID).blocked, "a frozen stranger must not block a stratum");
        assertEq(pool.price(VERIFIED_ID), 9975, "price must be unaffected by a stranger");
    }

    /// @notice A frozen holder is still stopped individually, without touching the stratum.
    /// @dev The per-redeemer freeze check is the correct place for this, and no caller can
    ///      influence it.
    function test_F1_frozenHolderStillBlockedIndividually() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        policyMock.setFrozen(verifiedLp, true);

        vm.prank(verifiedLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Blocked), "the holder is blocked");
        assertEq(plan.reason, StrataTypes.REASON_FROZEN, "and the reason is the freeze");
        assertFalse(pool.stratum(VERIFIED_ID).blocked, "but the stratum itself is untouched");
    }

    /// @notice An asset-wide pause does block, and anyone may report it.
    function test_F1_assetPauseBlocksAndIsPermissionless() public {
        policyMock.setPaused(address(aToken), true);

        vm.prank(griefer);
        pool.syncStratum(VERIFIED_ID);

        assertTrue(pool.stratum(VERIFIED_ID).blocked, "an asset-wide pause must block");
    }

    /// @notice Only the owner may block a stratum as a compliance action.
    function test_F1_onlyOwnerBlocksOnRevocation() public {
        vm.prank(openLp);
        vm.expectRevert();
        pool.setStratumBlocked(VERIFIED_ID, true, StrataTypes.REASON_FROZEN);
    }

    // ---------------------------------------------------------------------
    // F2 - HIGH - entitlement and settlement read different sources
    // ---------------------------------------------------------------------

    /// @notice Withdrawing more shares than held fails with a named, explicable error.
    /// @dev Entitlement is computed from credential-keyed lots while settlement burns the
    ///      ERC20 balance of the caller. Without an explicit check the call failed deep
    ///      inside _burn with an ERC20 error that explained nothing about the real cause.
    function test_F2_withdrawBeyondHeldSharesIsNamed() public {
        vm.prank(verifiedLp);
        pool.deposit(10 * ONE);

        vm.prank(verifiedLp);
        vm.expectRevert(abi.encodeWithSelector(StrataPool.InsufficientShares.selector, 10 * ONE, 11 * ONE));
        pool.withdraw(uint128(11 * ONE));
    }

    /// @notice Acquiring the credential of another party does not reach their position.
    /// @dev An A-Pass is an ERC-721 and can move. If it does, credentialOf resolves the new
    ///      holder onto lots they never funded. The share check stops that at the door
    ///      rather than letting it fail confusingly during settlement.
    function test_F2_acquiredCredentialCannotDrainAnotherPosition() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        // The credential moves to a party who never deposited.
        passRegistry.revoke(verifiedLp);
        passRegistry.issue(griefer, 1001);

        vm.prank(griefer);
        vm.expectRevert(abi.encodeWithSelector(StrataPool.InsufficientShares.selector, 0, 100 * ONE));
        pool.withdraw(uint128(100 * ONE));

        assertEq(token.balanceOf(address(pool)), 100 * ONE, "not a unit left the pool");
    }

    // ---------------------------------------------------------------------
    // F3 - MEDIUM - deferred accounting desynchronisation
    // ---------------------------------------------------------------------

    /// @notice Deferred shares report the outstanding amount, not a running total.
    /// @dev Accumulating made two attempts against one 42-share position report 84 deferred,
    ///      and nothing ever decremented it on success. A compliance officer reading that
    ///      number would see a liability that does not exist.
    function test_F3_deferredIsAssignedNotAccumulated() public {
        vm.prank(openLp);
        pool.deposit(58 * ONE);
        passRegistry.issue(openLp, 4004);
        vm.prank(openLp);
        pool.deposit(42 * ONE);
        vm.prank(owner);
        pool.configureStratum(VERIFIED_ID, 2, 0, 25);

        (bytes32 ref,) = pool.credentialOf(openLp);

        vm.prank(openLp);
        pool.withdraw(uint128(100 * ONE));
        uint256 first = pool.deferredShares(ref);

        vm.prank(openLp);
        pool.withdraw(uint128(42 * ONE));
        uint256 second = pool.deferredShares(ref);

        assertEq(first, 42 * ONE, "the first attempt defers the restricted portion");
        assertEq(second, 42 * ONE, "the second must not double-count the same shares");
    }

    // ---------------------------------------------------------------------
    // F4 - MEDIUM - the interface showed a number the chain would not honour
    // ---------------------------------------------------------------------

    /// @notice Preview matches settlement for a party verified after depositing.
    /// @dev withdraw() links the anonymous position onto the credential first. The view did
    ///      not, so a newly verified LP saw BLOCKED in the interface while the chain
    ///      returned ROUTED. The demo would have displayed a figure the contract disagreed
    ///      with, which is worse than showing nothing.
    function test_F4_previewMatchesSettlementAfterLateVerification() public {
        vm.prank(openLp);
        pool.deposit(58 * ONE);

        // Verified only after depositing, with no further deposit to trigger the link.
        passRegistry.issue(openLp, 5005);

        StrataTypes.ExitPlan memory preview = pool.previewExit(openLp, uint128(58 * ONE));

        vm.prank(openLp);
        StrataTypes.ExitPlan memory actual = pool.withdraw(uint128(58 * ONE));

        assertEq(uint8(preview.branch), uint8(actual.branch), "branch must match");
        assertEq(preview.burnable, actual.burnable, "burnable must match");
        assertGt(actual.burnable, 0, "the earlier position must remain reachable");
    }

    // ---------------------------------------------------------------------
    // Standing invariant: shares outstanding are always backed by assets held
    // ---------------------------------------------------------------------

    /// @notice The pool never owes more than it holds, across arbitrary deposit and exit flows.
    /// @dev The single property that matters most for solvency. Checked against fuzzed
    ///      amounts rather than one chosen scenario.
    function testFuzz_totalSupplyNeverExceedsAssets(uint128 a, uint128 b, uint128 exit) public {
        a = uint128(bound(a, 1, 500 * ONE));
        b = uint128(bound(b, 1, 500 * ONE));
        exit = uint128(bound(exit, 1, 500 * ONE));

        vm.prank(verifiedLp);
        pool.deposit(a);
        vm.prank(openLp);
        pool.deposit(b);

        if (exit <= pool.balanceOf(verifiedLp)) {
            vm.prank(verifiedLp);
            pool.withdraw(exit);
        }

        assertLe(
            pool.totalSupply(),
            token.balanceOf(address(pool)),
            "shares outstanding must never exceed assets held"
        );
    }
}
