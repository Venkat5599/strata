// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../src/StrataPool.sol";
import {StrataTypes} from "../src/StrataResolver.sol";
import {ICleanversePolicy} from "../src/interfaces/ICleanversePolicy.sol";
import {IAPass} from "../src/interfaces/IAPass.sol";

/// @title StrataPoolForkTest
/// @notice Runs STRATA against the REAL deployed Cleanverse contracts on Monad testnet.
///
/// @dev Mocks prove a contract is self-consistent. They cannot prove the integration is real,
///      because a mock encodes what its author believed the counterparty does. Every
///      assumption STRATA makes about Cleanverse is therefore re-checked here against the
///      live chain, including the one that shaped the whole architecture: that canTransfer
///      reverts rather than returning false.
///
///      Opt-in, because it needs network access:
///        RUN_FORK=1 forge test --match-contract StrataPoolForkTest -vv
contract StrataPoolForkTest is Test {
    // Live Monad testnet (chainId 10143), discovered via the Cleanverse REST API and
    // confirmed by direct eth_call on 2026-08-08.
    address internal constant AUSDC = 0xaC0893567D43C3E7e6e35a72803df05416C1f20D;
    address internal constant APASS = 0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9;
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    /// @dev A real A-Pass holder on Monad testnet. Confirmed live: balanceOf == 1 and a
    ///      non-zero aUSDC balance. Used as the verified LP so the test exercises a genuine
    ///      credential rather than one this test invented.
    address internal constant REAL_HOLDER = 0x5702b24116718DCF49314231222A33403e88Aff8;

    /// @dev An address with no A-Pass. This is the party whose canTransfer call reverts.
    address internal constant NO_PASS = 0x00000000000000000000000000000000DeaDBeef;

    StrataPool internal pool;
    ICleanversePolicy internal policy;
    IAPass internal apass;
    IERC20 internal ausdc;
    IERC20 internal usdc;

    address internal owner = address(0xA11CE);

    function setUp() public {
        if (!vm.envOr("RUN_FORK", false)) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(vm.envOr("MONAD_RPC_URL", string("https://testnet-rpc.monad.xyz")));

        policy = ICleanversePolicy(POLICY);
        apass = IAPass(APASS);
        ausdc = IERC20(AUSDC);
        usdc = IERC20(USDC);

        // Pool custodies plain USDC; aUSDC is only the reference instrument for policy reads.
        pool = new StrataPool(usdc, ausdc, policy, owner);
    }

    // ---------------------------------------------------------------------
    // The chain is what the interface says it is
    // ---------------------------------------------------------------------

    /// @notice The deployment is on the chain this test believes it is on.
    function test_fork_chainIsMonadTestnet() public view {
        assertEq(block.chainid, 10143, "must be Monad testnet");
    }

    /// @notice The Policy contract agrees with the REST API about which A-Pass registry it uses.
    /// @dev Two independent sources - an eth_call and the /query_deposit_atoken_list response -
    ///      naming the same address is what makes this address trustworthy rather than assumed.
    function test_fork_policyAndApassAgree() public view {
        assertEq(policy.apass(), APASS, "policy names the A-Pass address the REST API returned");
        assertEq(address(pool.apass()), APASS, "pool wired itself from the policy, not a constant");
    }

    /// @notice aUSDC is a registered A-Token and is not paused.
    function test_fork_assetIsRegisteredAndLive() public view {
        assertTrue(policy.isTokenRegistered(AUSDC), "aUSDC must be registered");
        assertFalse(policy.isPaused(AUSDC), "aUSDC must not be paused");
    }

    /// @notice Plain USDC is NOT an A-Token, so it cannot serve as the compliance reference.
    /// @dev Guards the constructor check against the real registry rather than a mock that
    ///      was told what to say. USDC is perfectly valid as the POOLED asset - that is the
    ///      whole point - it is only invalid as the instrument policy questions are asked in.
    function test_fork_poolRefusesUnregisteredComplianceRef() public {
        assertFalse(policy.isTokenRegistered(USDC), "plain USDC is not an A-Token");
        vm.expectRevert(abi.encodeWithSelector(StrataPool.AssetNotRegisteredWithPolicy.selector, USDC));
        new StrataPool(usdc, usdc, policy, owner);
    }

    // ---------------------------------------------------------------------
    // The architectural claim, checked against the live contract
    // ---------------------------------------------------------------------

    /// @notice canTransfer REVERTS for a party with no A-Pass. It does not return false.
    /// @dev This is the single most important assertion in the repository. The entire design
    ///      of STRATA follows from it: Cleanverse answers non-compliance with a hard revert,
    ///      which is legally coarse, and STRATA converts that into a graded outcome. If this
    ///      assertion ever fails, the premise has changed and the design should be revisited.
    function test_fork_canTransferRevertsForPartyWithoutApass() public {
        assertEq(apass.balanceOf(NO_PASS), 0, "fixture must genuinely hold no A-Pass");

        vm.expectRevert();
        policy.canTransfer(AUSDC, address(0), NO_PASS, 1);
    }

    /// @notice A real credential holder clears the same call that reverts for a stranger.
    function test_fork_canTransferSucceedsForRealHolder() public view {
        assertEq(apass.balanceOf(REAL_HOLDER), 1, "fixture must genuinely hold an A-Pass");
        assertTrue(policy.canTransfer(AUSDC, address(0), REAL_HOLDER, 1), "holder must clear");
    }

    /// @notice The pool turns that revert into a boolean without propagating it.
    /// @dev Proves the try/catch works against the real contract, not just against a mock
    ///      that was written to revert.
    function test_fork_poolMapsRevertToFalse() public view {
        assertFalse(pool.policyClears(NO_PASS), "a reverting check must read as not-clearing");
        assertTrue(pool.policyClears(REAL_HOLDER), "a real holder must read as clearing");
    }

    /// @notice An unregistered token makes canTransfer revert with TokenNotRegistered.
    function test_fork_unregisteredTokenReverts() public {
        vm.expectRevert();
        policy.canTransfer(USDC, address(0), REAL_HOLDER, 1);
    }

    // ---------------------------------------------------------------------
    // End to end against live compliance
    // ---------------------------------------------------------------------

    /// @notice Deposit and withdraw executed against the live Policy and A-Pass contracts.
    function test_fork_depositAndDirectExit() public {
        uint256 amount = 5e6; // 5 USDC
        deal(USDC, REAL_HOLDER, amount);

        vm.startPrank(REAL_HOLDER);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(amount);
        vm.stopPrank();

        (bytes32 ref, uint8 tier) = pool.credentialOf(REAL_HOLDER);
        assertEq(tier, 1, "a real A-Pass holder reads as credentialled");

        StrataTypes.Position[] memory lots = pool.lotsOf(ref);
        assertEq(lots.length, 1, "one lot");
        assertEq(lots[0].stratumId, pool.STRATUM_VERIFIED(), "credentialled deposit lands in VERIFIED");
        assertEq(lots[0].shares, amount, "shares match the deposit");

        uint256 balanceBefore = usdc.balanceOf(REAL_HOLDER);

        vm.prank(REAL_HOLDER);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(amount));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Direct), "a cleared holder exits Direct");
        assertEq(plan.burnable, amount, "the whole position is redeemable");
        assertEq(usdc.balanceOf(REAL_HOLDER) - balanceBefore, amount, "paid in full");
    }

    /// @notice An address with no credential still gets a position and a legal exit.
    /// @dev The point of the project stated as a test. A pool-level gate would reject this
    ///      party outright; STRATA gives them the OPEN stratum. Their exit is Blocked on the
    ///      policy check rather than reverted, so they receive a reason code instead of a
    ///      failed transaction.
    function test_fork_uncredentialledPartyIsRoutedNotRejected() public {
        uint256 amount = 3e6;
        deal(USDC, NO_PASS, amount);

        vm.startPrank(NO_PASS);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(amount);
        vm.stopPrank();

        (bytes32 ref, uint8 tier) = pool.credentialOf(NO_PASS);
        assertEq(tier, 0, "no credential");

        StrataTypes.Position[] memory lots = pool.lotsOf(ref);
        assertEq(lots[0].stratumId, pool.STRATUM_OPEN(), "lands in OPEN rather than being refused");

        vm.prank(NO_PASS);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(amount));

        // The live policy reverts for this party, the pool maps that to not-clearing, and the
        // resolver reports it as a policy block with a reason rather than a failed call.
        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Blocked), "no legal path today");
        assertEq(plan.reason, StrataTypes.REASON_POLICY, "and the reason is recorded, not thrown");
        assertEq(plan.deferred, amount, "the whole claim defers to compliant liquidation");
    }

    /// @notice The compliance basis is readable on a live deployment.
    function test_fork_basisIsReadable() public view {
        int256 b = pool.basis(pool.STRATUM_VERIFIED(), pool.STRATUM_OPEN());
        assertEq(b, 225, "VERIFIED trades 225 bps above OPEN at the configured discounts");
    }
}
