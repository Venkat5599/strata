// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StrataResolver, StrataTypes} from "../src/StrataResolver.sol";

/// @notice Thin external wrapper so the pure library can be fuzzed through a call boundary.
contract ResolverHarness {
    function resolve(
        StrataTypes.RedeemerView memory v,
        StrataTypes.Position[] memory positions,
        StrataTypes.StratumState[] memory strata,
        uint128 requested
    ) external pure returns (StrataTypes.ExitPlan memory) {
        return StrataResolver.resolve(v, positions, strata, requested);
    }
}

/// @title StrataResolverTest
/// @notice The correctness argument for STRATA.
/// @dev The resolver decides how much of a position may legally leave the pool. If it is
///      wrong, every other part of the project is decoration. So it is tested as a set of
///      properties over arbitrary input rather than a handful of chosen examples.
///
///      Four invariants, matching ARCHITECTURE.md section 4:
///        I1  burnable + deferred == requested
///        I2  burnable <= sum(shares of positions that clear)
///        I3  stratum.blocked  =>  that stratum contributes nothing
///        I4  redeemer frozen  =>  branch == Blocked
contract StrataResolverTest is Test {
    ResolverHarness internal harness;

    bytes32 internal constant ALICE = keccak256("alice-apass");
    bytes32 internal constant BOB = keccak256("bob-apass");

    function setUp() public {
        harness = new ResolverHarness();
    }

    // ---------------------------------------------------------------------
    // Input construction
    // ---------------------------------------------------------------------

    /// @dev Builds a bounded, well-formed scenario from raw fuzz words. Bounding keeps the
    ///      search inside the space the pool can actually produce, so the fuzzer spends its
    ///      runs on meaningful states instead of rejected ones.
    function _build(uint256 seed, uint8 nPositions, uint8 nStrata)
        internal
        pure
        returns (StrataTypes.Position[] memory positions, StrataTypes.StratumState[] memory strata)
    {
        uint256 pc = uint256(nPositions) % 8 + 1; // 1..8 lots
        uint256 sc = uint256(nStrata) % 4 + 1; // 1..4 strata

        strata = new StrataTypes.StratumState[](sc);
        for (uint256 i = 0; i < sc; ++i) {
            uint256 w = uint256(keccak256(abi.encode(seed, "stratum", i)));
            strata[i] = StrataTypes.StratumState({
                minTier: uint8(w % 100),
                lockUntil: uint64((w >> 8) % 2_000_000),
                blocked: ((w >> 16) & 1) == 1
            });
        }

        positions = new StrataTypes.Position[](pc);
        for (uint256 i = 0; i < pc; ++i) {
            uint256 w = uint256(keccak256(abi.encode(seed, "position", i)));
            positions[i] = StrataTypes.Position({
                // Mix in a foreign credential so the "only your own claim" rule is exercised.
                cviRef: ((w >> 32) & 3) == 0 ? BOB : ALICE,
                shares: uint128(w % 1_000_000e6),
                stratumId: uint8((w >> 24) % (sc + 1)) // deliberately allows an out-of-range id
            });
        }
    }

    function _view(uint256 seed, uint128 requested)
        internal
        pure
        returns (StrataTypes.RedeemerView memory v)
    {
        uint256 w = uint256(keccak256(abi.encode(seed, "redeemer", requested)));
        v = StrataTypes.RedeemerView({
            cviRef: ALICE,
            tier: uint8(w % 100),
            frozen: ((w >> 8) & 1) == 1,
            policyClears: ((w >> 9) & 1) == 1,
            timestamp: uint64((w >> 16) % 2_000_000)
        });
    }

    // ---------------------------------------------------------------------
    // I1 - conservation
    // ---------------------------------------------------------------------

    /// @notice Nothing is created and nothing vanishes: the request is fully accounted for.
    function testFuzz_I1_conservation(uint256 seed, uint8 nP, uint8 nS, uint128 requested) public view {
        requested = uint128(bound(requested, 0, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        StrataTypes.ExitPlan memory plan = harness.resolve(_view(seed, requested), p, s, requested);

        assertEq(
            uint256(plan.burnable) + uint256(plan.deferred),
            uint256(requested),
            "I1: burnable + deferred must equal requested"
        );
    }

    // ---------------------------------------------------------------------
    // I2 - no over-release
    // ---------------------------------------------------------------------

    /// @notice The pool never releases more than the redeemer legally holds.
    /// @dev The bound is recomputed here independently of the resolver, so a bug that
    ///      inflated the entitlement inside resolve() cannot also relax the assertion.
    function testFuzz_I2_noOverRelease(uint256 seed, uint8 nP, uint8 nS, uint128 requested) public view {
        requested = uint128(bound(requested, 0, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        StrataTypes.RedeemerView memory v = _view(seed, requested);
        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, requested);

        uint256 eligible = 0;
        for (uint256 i = 0; i < p.length; ++i) {
            if (p[i].cviRef != v.cviRef) continue;
            if (p[i].stratumId >= s.length) continue;
            StrataTypes.StratumState memory st = s[p[i].stratumId];
            if (st.blocked) continue;
            if (v.tier < st.minTier) continue;
            if (st.lockUntil > v.timestamp) continue;
            if (!v.policyClears) continue;
            if (v.frozen) continue;
            eligible += p[i].shares;
        }

        assertLe(uint256(plan.burnable), eligible, "I2: burnable exceeds the legally eligible total");
    }

    // ---------------------------------------------------------------------
    // I3 - revocation is absolute
    // ---------------------------------------------------------------------

    /// @notice A blocked stratum contributes nothing, ever.
    /// @dev Checked in the strongest available form: when every stratum the redeemer holds
    ///      is blocked, the payout must be exactly zero.
    function testFuzz_I3_blockedStratumNeverPays(uint256 seed, uint8 nP, uint8 nS, uint128 requested)
        public
        view
    {
        requested = uint128(bound(requested, 1, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        for (uint256 i = 0; i < s.length; ++i) {
            s[i].blocked = true;
        }

        StrataTypes.ExitPlan memory plan = harness.resolve(_view(seed, requested), p, s, requested);

        assertEq(plan.burnable, 0, "I3: a blocked stratum paid out");
        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Blocked), "I3: branch must be Blocked");
        assertEq(plan.deferred, requested, "I3: the whole request must defer");
    }

    // ---------------------------------------------------------------------
    // I4 - freeze dominates
    // ---------------------------------------------------------------------

    /// @notice An expired or frozen credential can never produce a payout.
    /// @dev This is the invariant that matters most in production. A frozen party silently
    ///      passing as Direct is the failure mode with real legal consequences, so it is
    ///      asserted against arbitrary otherwise-permissive state.
    function testFuzz_I4_frozenAlwaysBlocked(uint256 seed, uint8 nP, uint8 nS, uint128 requested)
        public
        view
    {
        requested = uint128(bound(requested, 1, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);

        // Make every other condition maximally permissive, so only the freeze can block.
        for (uint256 i = 0; i < s.length; ++i) {
            s[i] = StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false});
        }
        StrataTypes.RedeemerView memory v = _view(seed, requested);
        v.frozen = true;
        v.policyClears = true;
        v.tier = 99;

        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, requested);

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Blocked), "I4: frozen must be Blocked");
        assertEq(plan.burnable, 0, "I4: frozen paid out");
        assertEq(plan.reason, StrataTypes.REASON_FROZEN, "I4: reason must be REASON_FROZEN");
    }

    // ---------------------------------------------------------------------
    // Branch classification
    // ---------------------------------------------------------------------

    /// @notice The three branches are exhaustive and mutually exclusive.
    function testFuzz_branchMatchesAmounts(uint256 seed, uint8 nP, uint8 nS, uint128 requested)
        public
        view
    {
        requested = uint128(bound(requested, 1, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        StrataTypes.ExitPlan memory plan = harness.resolve(_view(seed, requested), p, s, requested);

        if (plan.branch == StrataTypes.Branch.Direct) {
            assertEq(plan.burnable, requested, "Direct must satisfy the request in full");
        } else if (plan.branch == StrataTypes.Branch.Routed) {
            assertGt(plan.burnable, 0, "Routed must pay something");
            assertLt(plan.burnable, requested, "Routed must be a strict subset");
        } else {
            assertEq(plan.burnable, 0, "Blocked must pay nothing");
        }
    }

    /// @notice A non-satisfiable outcome always carries a reason a compliance officer can read.
    function testFuzz_nonDirectAlwaysExplains(uint256 seed, uint8 nP, uint8 nS, uint128 requested)
        public
        view
    {
        requested = uint128(bound(requested, 1, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        StrataTypes.ExitPlan memory plan = harness.resolve(_view(seed, requested), p, s, requested);

        if (plan.branch != StrataTypes.Branch.Direct) {
            assertTrue(plan.reason != StrataTypes.REASON_NONE, "a partial or blocked exit must say why");
        }
    }

    /// @notice One party can never redeem the legal claim of another.
    function testFuzz_foreignCredentialNeverRedeemable(uint256 seed, uint8 nP, uint8 nS, uint128 requested)
        public
        view
    {
        requested = uint128(bound(requested, 1, 10_000_000e6));
        (StrataTypes.Position[] memory p, StrataTypes.StratumState[] memory s) = _build(seed, nP, nS);
        for (uint256 i = 0; i < p.length; ++i) {
            p[i].cviRef = BOB; // every lot belongs to somebody else
        }
        for (uint256 i = 0; i < s.length; ++i) {
            s[i] = StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false});
        }

        StrataTypes.RedeemerView memory v = _view(seed, requested);
        v.frozen = false;
        v.policyClears = true;
        v.tier = 99;

        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, requested);

        assertEq(plan.burnable, 0, "redeemed against a credential that was not theirs");
        assertEq(plan.reason, StrataTypes.REASON_NO_POSITION, "reason must be REASON_NO_POSITION");
    }

    // ---------------------------------------------------------------------
    // The demo beat, pinned as a test
    // ---------------------------------------------------------------------

    /// @notice Beat 2 of the demo: a full withdrawal returns a partial, not a revert.
    /// @dev PRD.md section 7 says beat 2 must be unmistakable or the project reads as a
    ///      whitelist. Pinning it as a deterministic test means a refactor cannot quietly
    ///      turn the invention back into a hard failure.
    function test_beat2_partialExitInsteadOfRevert() public view {
        StrataTypes.StratumState[] memory s = new StrataTypes.StratumState[](2);
        s[0] = StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false}); // OPEN
        s[1] = StrataTypes.StratumState({minTier: 20, lockUntil: 0, blocked: false}); // VERIFIED

        StrataTypes.Position[] memory p = new StrataTypes.Position[](2);
        p[0] = StrataTypes.Position({cviRef: ALICE, shares: 58e6, stratumId: 0});
        p[1] = StrataTypes.Position({cviRef: ALICE, shares: 42e6, stratumId: 1});

        // An unverified LP: no tier, so the VERIFIED stratum is closed to them.
        StrataTypes.RedeemerView memory v = StrataTypes.RedeemerView({
            cviRef: ALICE,
            tier: 0,
            frozen: false,
            policyClears: true,
            timestamp: uint64(block.timestamp)
        });

        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, 100e6);

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Routed), "must route, not revert");
        assertEq(plan.burnable, 58e6, "58 percent is legally redeemable");
        assertEq(plan.deferred, 42e6, "42 percent defers");
        assertEq(plan.reason, StrataTypes.REASON_TIER, "reason is the tier restriction");
    }

    /// @notice A fully cleared redeemer exits in one call, with no residue.
    function test_directExitWhenFullyCleared() public view {
        StrataTypes.StratumState[] memory s = new StrataTypes.StratumState[](1);
        s[0] = StrataTypes.StratumState({minTier: 20, lockUntil: 0, blocked: false});

        StrataTypes.Position[] memory p = new StrataTypes.Position[](1);
        p[0] = StrataTypes.Position({cviRef: ALICE, shares: 100e6, stratumId: 0});

        StrataTypes.RedeemerView memory v = StrataTypes.RedeemerView({
            cviRef: ALICE,
            tier: 20,
            frozen: false,
            policyClears: true,
            timestamp: uint64(block.timestamp)
        });

        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, 100e6);

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Direct), "must be Direct");
        assertEq(plan.burnable, 100e6, "the whole request clears");
        assertEq(plan.deferred, 0, "nothing defers");
    }

    /// @notice Unlocked lots are consumed before locked ones.
    /// @dev Without the two-pass ordering a redeemer could be told to wait while an
    ///      immediately redeemable lot sat untouched, which is a worse answer than the
    ///      law requires.
    function test_unlockedLotsConsumedFirst() public view {
        StrataTypes.StratumState[] memory s = new StrataTypes.StratumState[](2);
        s[0] = StrataTypes.StratumState({
            minTier: 0,
            lockUntil: uint64(block.timestamp + 30 days),
            blocked: false
        });
        s[1] = StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false});

        // The locked lot is listed first, so array order alone would pick it.
        StrataTypes.Position[] memory p = new StrataTypes.Position[](2);
        p[0] = StrataTypes.Position({cviRef: ALICE, shares: 50e6, stratumId: 0});
        p[1] = StrataTypes.Position({cviRef: ALICE, shares: 50e6, stratumId: 1});

        StrataTypes.RedeemerView memory v = StrataTypes.RedeemerView({
            cviRef: ALICE,
            tier: 99,
            frozen: false,
            policyClears: true,
            timestamp: uint64(block.timestamp)
        });

        StrataTypes.ExitPlan memory plan = harness.resolve(v, p, s, 50e6);

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Direct), "the unlocked lot satisfies it");
        assertEq(plan.burnable, 50e6, "must draw from the unlocked lot");
    }

    /// @notice A zero request is a no-op, not a spurious Blocked.
    function test_zeroRequestIsDirectNoOp() public view {
        StrataTypes.StratumState[] memory s = new StrataTypes.StratumState[](1);
        s[0] = StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false});
        StrataTypes.Position[] memory p = new StrataTypes.Position[](0);

        StrataTypes.ExitPlan memory plan = harness.resolve(_view(1, 0), p, s, 0);

        assertEq(uint8(plan.branch), uint8(StrataTypes.Branch.Direct), "zero request is Direct");
        assertEq(plan.burnable, 0, "nothing burns");
        assertEq(plan.deferred, 0, "nothing defers");
    }
}
