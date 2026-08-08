// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title StrataTypes
/// @notice Shared value types for the STRATA exit resolver.
library StrataTypes {
    /// @notice Outcome of a withdrawal request.
    /// @dev Direct  - the redeemer clears every restriction on the shares requested.
    ///      Routed  - the redeemer clears a strict, non-empty subset. Burn only that part.
    ///      Blocked - no legally redeemable share exists right now.
    enum Branch {
        Direct,
        Routed,
        Blocked
    }

    /// @notice Reason codes reported when a request is not fully satisfiable.
    uint8 internal constant REASON_NONE = 0;
    uint8 internal constant REASON_FROZEN = 1;
    uint8 internal constant REASON_POLICY = 2;
    uint8 internal constant REASON_STRATUM_BLOCKED = 3;
    uint8 internal constant REASON_LOCKED = 4;
    uint8 internal constant REASON_TIER = 5;
    uint8 internal constant REASON_NO_POSITION = 6;
    /// @dev The redeemer cleared every legal restriction but asked for more shares than the
    ///      credential actually holds. Distinct from the compliance reasons above: nothing is
    ///      wrong with the party, the request simply exceeds the claim. Found by
    ///      testFuzz_nonDirectAlwaysExplains, which refused to accept a partial exit that
    ///      could not say why it was partial.
    uint8 internal constant REASON_INSUFFICIENT_SHARES = 7;

    /// @notice A share lot, stamped at deposit with the credential that created it.
    /// @param cviRef Credential reference: keccak256 of the depositor A-Pass token id.
    ///        Positions key on the credential, never on msg.sender - an address is not a
    ///        legal person, a credential is, so a fresh wallet inherits nothing.
    /// @param shares Share quantity in this lot.
    /// @param stratumId Index into the strata array this lot belongs to.
    /// @param aTokenBacked True when this lot is backed by a Cleanverse A-Token rather than
    ///        the plain underlying. Two lots can sit in the same stratum and still be backed
    ///        by different instruments, because what a claim is worth legally and what it is
    ///        denominated in are separate facts. The resolver ignores this field entirely -
    ///        it decides legality - and the pool reads it to settle in the right token.
    struct Position {
        bytes32 cviRef;
        uint128 shares;
        uint8 stratumId;
        bool aTokenBacked;
    }

    /// @notice Legal configuration and live state of one stratum.
    /// @param minTier Minimum A-Pass tier required to redeem from this stratum. 0 means open.
    /// @param lockUntil Unix seconds before which this stratum cannot be redeemed. 0 means no lock.
    /// @param blocked Set when the credential backing this stratum is revoked or frozen upstream.
    struct StratumState {
        uint8 minTier;
        uint64 lockUntil;
        bool blocked;
    }

    /// @notice Everything the resolver needs to know about the party asking to exit.
    /// @dev This struct is the seam that keeps the resolver pure. StrataPool populates it
    ///      from live Cleanverse Policy and A-Pass reads; tests populate it from fuzz input.
    /// @param cviRef Credential reference of the redeemer. Only positions carrying the same
    ///        cviRef are candidates - one party cannot redeem the legal claim of another.
    /// @param tier A-Pass tier held by the redeemer. 0 means no credential.
    /// @param frozen True when the Cleanverse Policy reports the redeemer frozen for the asset.
    /// @param policyClears Result of Policy.canTransfer, with a revert mapped to false.
    /// @param timestamp Evaluation time, compared against the lockUntil of each stratum.
    struct RedeemerView {
        bytes32 cviRef;
        uint8 tier;
        bool frozen;
        bool policyClears;
        uint64 timestamp;
    }

    /// @notice The computed exit plan. StrataPool applies it; the resolver never mutates.
    /// @param branch Direct, Routed or Blocked.
    /// @param burnable Shares that may be burned and paid out right now.
    /// @param deferred Shares of the request that cannot be satisfied. burnable + deferred
    ///        always equals the amount requested.
    /// @param reason Dominant reason code when the request is not fully satisfiable.
    struct ExitPlan {
        Branch branch;
        uint128 burnable;
        uint128 deferred;
        uint8 reason;
    }
}

/// @title StrataResolver
/// @notice Decides how much of a withdrawal request is legally redeemable, and why.
/// @dev This library is the contribution of the project, and it is deliberately pure:
///      no storage, no external calls, no msg.sender. That makes every claim it makes
///      exhaustively fuzzable, which is the correctness argument STRATA rests on.
///
///      The industry answer to a non-compliant redeemer is to revert the whole call.
///      The Cleanverse Policy contract does exactly that - probed live on Monad testnet,
///      canTransfer reverts rather than returning false when a party holds no A-Pass.
///      Reverting is a legally coarse answer: it treats "you may redeem 58 percent of
///      this" as identical to "you may redeem nothing". This resolver replaces that
///      binary with a graded one.
library StrataResolver {
    /// @notice Compute the exit plan for `requested` shares.
    /// @param v The live compliance view of the redeemer.
    /// @param positions The candidate share lots of the redeemer.
    /// @param strata Stratum configuration, indexed by Position.stratumId.
    /// @param requested Shares the redeemer is asking to burn.
    /// @return plan The branch, the legally burnable amount, the deferred remainder, and a reason.
    ///
    /// @dev Guarantees, each enforced by a fuzz invariant in test/StrataResolver.t.sol:
    ///      I1  plan.burnable + plan.deferred == requested            (conservation)
    ///      I2  plan.burnable <= sum(shares of positions that clear)  (no over-release)
    ///      I3  no blocked stratum contributes to burnable            (revocation is absolute)
    ///      I4  v.frozen implies plan.branch == Blocked               (freeze dominates)
    function resolve(
        StrataTypes.RedeemerView memory v,
        StrataTypes.Position[] memory positions,
        StrataTypes.StratumState[] memory strata,
        uint128 requested
    ) internal pure returns (StrataTypes.ExitPlan memory plan) {
        // A zero request is trivially Direct. Stated explicitly so the branch classifier
        // below never has to treat 0 == 0 as a degenerate "fully satisfied" case.
        if (requested == 0) {
            return StrataTypes.ExitPlan({
                branch: StrataTypes.Branch.Direct,
                burnable: 0,
                deferred: 0,
                reason: StrataTypes.REASON_NONE
            });
        }

        // A frozen credential dominates every other consideration. This is checked before
        // any position is examined, so no combination of stratum state can produce a
        // non-zero payout to a frozen party. I4 depends on this ordering.
        if (v.frozen) {
            return StrataTypes.ExitPlan({
                branch: StrataTypes.Branch.Blocked,
                burnable: 0,
                deferred: requested,
                reason: StrataTypes.REASON_FROZEN
            });
        }

        uint128 remaining = requested;
        uint128 burnable = 0;
        uint8 reason = StrataTypes.REASON_NONE;
        bool sawCandidate = false;

        // Greedy fill in two passes over the positions of the redeemer. Unlocked lots are
        // consumed before locked ones, so a redeemer is never told "come back later" while
        // an immediately redeemable lot sits untouched.
        for (uint256 pass = 0; pass < 2 && remaining > 0; ++pass) {
            bool wantLocked = (pass == 1);

            for (uint256 i = 0; i < positions.length && remaining > 0; ++i) {
                StrataTypes.Position memory p = positions[i];

                // Only the credential of the redeemer may be redeemed.
                if (p.cviRef != v.cviRef) continue;
                if (p.shares == 0) continue;
                if (p.stratumId >= strata.length) continue;

                sawCandidate = true;
                StrataTypes.StratumState memory s = strata[p.stratumId];

                bool locked = s.lockUntil > v.timestamp;
                if (locked != wantLocked) continue;

                // Each disqualifier records why, so a Blocked or Routed outcome can explain
                // itself to a compliance officer instead of merely failing.
                if (s.blocked) {
                    reason = StrataTypes.REASON_STRATUM_BLOCKED;
                    continue;
                }
                if (v.tier < s.minTier) {
                    reason = StrataTypes.REASON_TIER;
                    continue;
                }
                if (locked) {
                    reason = StrataTypes.REASON_LOCKED;
                    continue;
                }
                if (!v.policyClears) {
                    reason = StrataTypes.REASON_POLICY;
                    continue;
                }

                uint128 take = p.shares < remaining ? p.shares : remaining;
                burnable += take;
                remaining -= take;
            }
        }

        if (!sawCandidate) reason = StrataTypes.REASON_NO_POSITION;

        // Every non-Direct outcome must be able to explain itself. If the request fell short
        // without any compliance rule firing, the shortfall is purely quantitative and is
        // reported as such rather than left silent.
        if (remaining > 0 && reason == StrataTypes.REASON_NONE) {
            reason = StrataTypes.REASON_INSUFFICIENT_SHARES;
        }

        // Conservation is structural, not asserted: deferred is defined as what is left of
        // the request, so I1 holds by construction rather than by arithmetic luck.
        plan.burnable = burnable;
        plan.deferred = requested - burnable;

        if (burnable == requested) {
            plan.branch = StrataTypes.Branch.Direct;
            plan.reason = StrataTypes.REASON_NONE;
        } else if (burnable > 0) {
            // The invention. A partial legal exit, not a revert.
            plan.branch = StrataTypes.Branch.Routed;
            plan.reason = reason;
        } else {
            plan.branch = StrataTypes.Branch.Blocked;
            plan.reason = reason;
        }
    }
}
