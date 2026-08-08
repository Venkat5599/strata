// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {StrataTypes} from "../contracts/StrataResolver.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";

/// @notice Six-decimal stand-in for aUSDC.
contract MockAToken is ERC20 {
    constructor() ERC20("Mock aUSDC", "aUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Stand-in for the Cleanverse A-Pass ERC-721 registry.
contract MockAPass {
    mapping(address => uint256) public tokenIdOf;

    function issue(address holder, uint256 tokenId) external {
        tokenIdOf[holder] = tokenId;
    }

    function revoke(address holder) external {
        tokenIdOf[holder] = 0;
    }

    function balanceOf(address holder) external view returns (uint256) {
        return tokenIdOf[holder] == 0 ? 0 : 1;
    }

    /// @dev Reverts for non-holders, matching the live contract.
    function getTokenId(address holder) external view returns (uint256) {
        uint256 id = tokenIdOf[holder];
        require(id != 0, "no apass");
        return id;
    }

    function ownerOf(uint256) external pure returns (address) {
        return address(0);
    }
}

/// @notice Stand-in for the Cleanverse Policy contract.
/// @dev Reproduces the behaviour that matters most: canTransfer REVERTS for a party with no
///      A-Pass rather than returning false. Verified against the live Monad testnet contract
///      at 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd on 2026-08-08. Mocking the revert
///      rather than a false return is the whole point - if the mock returned false, the
///      try/catch in StrataPool would never be exercised and the tests would pass against
///      behaviour the real chain does not have.
contract MockPolicy is ICleanversePolicy {
    error ApassRequired(address party);

    MockAPass public immutable passRegistry;
    mapping(address => bool) public registeredToken;
    mapping(address => bool) public frozenParty;
    mapping(address => bool) public pausedToken;

    constructor(MockAPass registry) {
        passRegistry = registry;
    }

    function registerToken(address token) external {
        registeredToken[token] = true;
    }

    function setFrozen(address party, bool value) external {
        frozenParty[party] = value;
    }

    function setPaused(address token, bool value) external {
        pausedToken[token] = value;
    }

    function canTransfer(address token, address from, address to, uint256) external view returns (bool) {
        if (!registeredToken[token]) revert("TokenNotRegistered");
        // Zero address is exempt on both sides (mint and burn paths), as probed live.
        if (from != address(0) && passRegistry.balanceOf(from) == 0) revert ApassRequired(from);
        if (to != address(0) && passRegistry.balanceOf(to) == 0) revert ApassRequired(to);
        if (frozenParty[from] || frozenParty[to]) return false;
        return true;
    }

    function isFrozen(address, address holder) external view returns (bool) {
        return frozenParty[holder];
    }

    function isPaused(address token) external view returns (bool) {
        return pausedToken[token];
    }

    function isTokenRegistered(address token) external view returns (bool) {
        return registeredToken[token];
    }

    function apass() external view returns (address) {
        return address(passRegistry);
    }
}

/// @title StrataPoolTest
/// @notice Integration behaviour of the pool against a policy that reverts the way the real
///         Cleanverse contract does.
contract StrataPoolTest is Test {
    MockAToken internal token; // plain USDC stand-in: the pooled asset
    MockAToken internal aToken; // registered A-Token stand-in: the compliance reference
    MockAPass internal passRegistry;
    MockPolicy internal policyMock;
    StrataPool internal pool;

    address internal owner = address(0xA11CE);
    address internal verifiedLp = address(0xBEEF);
    address internal openLp = address(0xCAFE);

    uint256 internal constant ONE = 1e6;

    /// @dev Cached because `pool.STRATUM_X()` is an external call. Passing it inline as an
    ///      argument would consume the preceding vm.prank/vm.expectRevert, which silently
    ///      applies the cheatcode to the constant read instead of the call under test.
    uint8 internal OPEN_ID;
    uint8 internal VERIFIED_ID;

    function setUp() public {
        token = new MockAToken(); // pooled asset, freely holdable by anyone
        aToken = new MockAToken(); // registered A-Token, used only as the policy reference
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
    // S1 - one pool, one curve, two strata
    // ---------------------------------------------------------------------

    /// @notice PRD success criterion S1: a verified and an unverified LP hold positions in the
    ///         same pool, on the same curve, in different strata.
    function test_S1_bothLpsShareOnePoolAndCurve() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);
        vm.prank(openLp);
        pool.deposit(100 * ONE);

        // One asset balance. This is the claim the whole project rests on.
        assertEq(token.balanceOf(address(pool)), 200 * ONE, "a single pooled balance");

        (bytes32 verifiedRef,) = pool.credentialOf(verifiedLp);
        (bytes32 openRef,) = pool.credentialOf(openLp);

        StrataTypes.Position[] memory vLots = pool.lotsOf(verifiedRef);
        StrataTypes.Position[] memory oLots = pool.lotsOf(openRef);

        assertEq(vLots[0].stratumId, VERIFIED_ID, "credentialled LP lands in VERIFIED");
        assertEq(oLots[0].stratumId, OPEN_ID, "uncredentialled LP lands in OPEN");
        assertTrue(verifiedRef != openRef, "the two credentials are distinct");
    }

    // ---------------------------------------------------------------------
    // S2 - the invention
    // ---------------------------------------------------------------------

    /// @notice PRD success criterion S2: an unverified full withdrawal returns Routed, not a revert.
    /// @dev The LP deposits while unverified (OPEN), later gains a credential and deposits again
    ///      (VERIFIED), then asks to exit everything. Only the OPEN portion clears once the bar
    ///      on VERIFIED is raised above what this redeemer holds.
    function test_S2_partialExitRoutesInsteadOfReverting() public {
        vm.prank(openLp);
        pool.deposit(58 * ONE); // OPEN, no credential yet

        passRegistry.issue(openLp, 2002); // credential granted later
        vm.prank(openLp);
        pool.deposit(42 * ONE); // VERIFIED

        // Raise the bar on VERIFIED so this redeemer no longer clears it, leaving OPEN legal.
        vm.prank(owner);
        pool.configureStratum(VERIFIED_ID, 2, 0, 25);

        uint256 before = token.balanceOf(openLp);

        vm.prank(openLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Routed), "must route, not revert");
        assertEq(plan.burnable, 58 * ONE, "only the OPEN portion is legally redeemable");
        assertEq(plan.deferred, 42 * ONE, "the restricted portion defers");
        assertEq(token.balanceOf(openLp) - before, 58 * ONE, "paid exactly the redeemable portion");
    }

    /// @notice A fully cleared LP exits in one call.
    function test_directExitPaysInFull() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        uint256 before = token.balanceOf(verifiedLp);

        vm.prank(verifiedLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Direct), "must be Direct");
        assertEq(token.balanceOf(verifiedLp) - before, 100 * ONE, "paid in full");
        assertEq(pool.balanceOf(verifiedLp), 0, "all shares burned");
    }

    // ---------------------------------------------------------------------
    // S4 - revocation widens the basis
    // ---------------------------------------------------------------------

    /// @notice PRD success criterion S4: revocation flips a stratum to Blocked and widens the basis.
    /// @dev This is demo beat 3, asserted rather than merely demonstrated.
    function test_S4_revocationBlocksStratumAndWidensBasis() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        int256 basisBefore = pool.basis(VERIFIED_ID, OPEN_ID);
        assertEq(basisBefore, 225, "VERIFIED trades 225 bps above OPEN while both are legal");

        // Cleanverse freezes the credential upstream.
        policyMock.setFrozen(verifiedLp, true);
        vm.prank(owner);
        pool.setStratumBlocked(VERIFIED_ID, true, StrataTypes.REASON_FROZEN);

        assertTrue(pool.stratum(VERIFIED_ID).blocked, "stratum must flip to blocked");
        assertEq(pool.price(VERIFIED_ID), 0, "a claim with no legal path is not worth par");

        int256 basisAfter = pool.basis(VERIFIED_ID, OPEN_ID);
        assertEq(basisAfter, -9750, "the basis widens: the restriction now has a visible price");
        assertLt(basisAfter, basisBefore, "revocation must widen the gap, never narrow it");
    }

    /// @notice A frozen holder cannot exit at all, and is told why.
    function test_frozenHolderIsBlockedWithReason() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        policyMock.setFrozen(verifiedLp, true);

        uint256 before = token.balanceOf(verifiedLp);

        vm.prank(verifiedLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Blocked), "frozen means Blocked");
        assertEq(plan.reason, StrataTypes.REASON_FROZEN, "the reason is recorded on-chain");
        assertEq(token.balanceOf(verifiedLp), before, "not a single unit moved");
    }

    /// @notice A blocked exit emits a receipt instead of reverting.
    /// @dev Reverting would erase the reason code and leave no on-chain record of the attempt,
    ///      which is exactly what a compliance audit trail must not do.
    function test_blockedExitEmitsRatherThanReverts() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);
        policyMock.setFrozen(verifiedLp, true);

        (bytes32 ref,) = pool.credentialOf(verifiedLp);

        vm.expectEmit(true, true, false, true, address(pool));
        emit StrataPool.ExitPlanned(
            ref, verifiedLp, StrataTypes.Branch.Blocked, 0, uint128(100 * ONE), StrataTypes.REASON_FROZEN
        );

        vm.prank(verifiedLp);
        pool.withdraw(uint128(100 * ONE));
    }

    // ---------------------------------------------------------------------
    // Accounting and safety
    // ---------------------------------------------------------------------

    /// @notice Settlement never pays out more than the plan authorised.
    /// @dev `requested` is bounded by the deposit because asking for more shares than are
    ///      held is now rejected up front with InsufficientShares - see the F2 finding in
    ///      StrataPoolAudit.t.sol, which covers that path directly. This test is about
    ///      settlement matching the plan, not about the entitlement guard.
    function testFuzz_settlementMatchesPlan(uint128 depositAmount, uint128 requested) public {
        depositAmount = uint128(bound(depositAmount, 1, 1_000 * ONE));
        requested = uint128(bound(requested, 1, depositAmount));

        vm.prank(verifiedLp);
        pool.deposit(depositAmount);

        uint256 before = token.balanceOf(verifiedLp);

        vm.prank(verifiedLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(requested);

        assertEq(token.balanceOf(verifiedLp) - before, plan.burnable, "paid exactly the planned amount");
        assertLe(plan.burnable, depositAmount, "never pays out more than was deposited");
        assertEq(
            uint256(plan.burnable) + uint256(plan.deferred), uint256(requested), "request fully accounted"
        );
    }

    /// @notice previewExit agrees with what withdraw actually settles.
    /// @dev The frontend renders beat 2 from previewExit before the user signs. If the preview
    ///      disagreed with settlement, the demo would show a number the chain would not honour.
    function test_previewMatchesSettlement() public {
        vm.prank(openLp);
        pool.deposit(58 * ONE);
        passRegistry.issue(openLp, 3003);
        vm.prank(openLp);
        pool.deposit(42 * ONE);
        vm.prank(owner);
        pool.configureStratum(VERIFIED_ID, 2, 0, 25);

        StrataTypes.ExitPlan memory preview = pool.previewExit(openLp, uint128(100 * ONE));

        vm.prank(openLp);
        StrataTypes.ExitPlan memory actual = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(preview.branch), uint8(actual.branch), "branch must match");
        assertEq(preview.burnable, actual.burnable, "burnable must match");
        assertEq(preview.deferred, actual.deferred, "deferred must match");
    }

    /// @notice Per-stratum share totals track every accounting path the pool can take.
    /// @dev The ledger renders these totals; if they drifted from totalSupply the frontend
    ///      would show a pool split that does not exist. Covers deposit, credential
    ///      migration, a partial (Routed) exit, a Direct exit, and an aUSDC deposit.
    function test_stratumTotalsEqualSupplyAcrossAllPaths() public {
        // OPEN deposit (58) + VERIFIED deposit (42) after late verification.
        vm.prank(openLp);
        pool.deposit(58 * ONE);
        passRegistry.issue(openLp, 3003);
        vm.prank(openLp);
        pool.deposit(42 * ONE);

        // Verified LP deposits aUSDC through the A-Token path.
        aToken.mint(verifiedLp, 10 * ONE);
        vm.prank(verifiedLp);
        aToken.approve(address(pool), type(uint256).max);
        vm.prank(verifiedLp);
        pool.depositAToken(10 * ONE);

        assertEq(pool.stratumTotalShares(OPEN_ID), 58 * ONE, "OPEN stratum holds the 58");
        assertEq(pool.stratumTotalShares(VERIFIED_ID), 52 * ONE, "VERIFIED holds 42 + 10 aUSDC");
        assertEq(
            pool.stratumTotalShares(OPEN_ID) + pool.stratumTotalShares(VERIFIED_ID),
            pool.totalSupply(),
            "stratum totals sum to totalSupply"
        );

        // Raise the VERIFIED bar so a full 100-share exit becomes Routed.
        vm.prank(owner);
        pool.configureStratum(VERIFIED_ID, 2, 0, 25);

        vm.prank(openLp);
        StrataTypes.ExitPlan memory plan = pool.withdraw(uint128(100 * ONE));

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Routed), "expect a partial exit");
        assertEq(
            pool.stratumTotalShares(OPEN_ID) + pool.stratumTotalShares(VERIFIED_ID),
            pool.totalSupply(),
            "totals still sum to supply after the routed exit"
        );

        // Burn the remainder directly. The 42 VERIFIED shares are tier-blocked
        // (minTier 2 vs tier 1), so they defer rather than burn - that is the honest
        // accounting, and the totals must reflect it.
        uint256 held = pool.balanceOf(openLp);
        vm.prank(openLp);
        pool.withdraw(uint128(held));

        assertEq(pool.stratumTotalShares(OPEN_ID), 0, "OPEN is empty");
        assertEq(pool.stratumTotalShares(VERIFIED_ID), 52 * ONE, "42 tier-blocked + 10 aUSDC remain");
        assertEq(
            pool.stratumTotalShares(OPEN_ID) + pool.stratumTotalShares(VERIFIED_ID),
            pool.totalSupply(),
            "totals still sum after the direct exit"
        );
    }

    /// @notice Shares cannot be transferred to a clean wallet to launder an exit.
    function test_sharesAreNonTransferable() public {
        vm.prank(verifiedLp);
        pool.deposit(100 * ONE);

        vm.prank(verifiedLp);
        vm.expectRevert(StrataPool.SharesAreNonTransferable.selector);
        pool.transfer(openLp, 1);
    }

    /// @notice Deploying against a compliance reference the policy does not know fails loudly.
    function test_deployRejectsUnregisteredAsset() public {
        MockAToken stranger = new MockAToken();
        vm.expectRevert(
            abi.encodeWithSelector(StrataPool.AssetNotRegisteredWithPolicy.selector, address(stranger))
        );
        new StrataPool(
            IERC20(address(token)), IERC20(address(stranger)), ICleanversePolicy(address(policyMock)), owner
        );
    }

    /// @notice Only the owner may reconfigure a stratum.
    function test_onlyOwnerConfiguresStrata() public {
        vm.prank(openLp);
        vm.expectRevert();
        pool.configureStratum(OPEN_ID, 5, 0, 100);
    }

    /// @notice Share decimals mirror the underlying asset.
    function test_decimalsMirrorAsset() public view {
        assertEq(pool.decimals(), 6, "aUSDC is a six-decimal asset");
    }
}
