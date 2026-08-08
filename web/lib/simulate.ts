// A TypeScript mirror of StrataResolver.resolve, used ONLY before a pool is deployed so the
// ledger can be driven without a chain.
//
// This is a mirror, not a second source of truth. Once NEXT_PUBLIC_POOL_ADDRESS is set the
// page reads previewExit from the contract and this file stops being consulted. Divergence
// between the two would be a bug in this file, never in the contract - the contract is the
// thing that is fuzzed.

import type {Stratum} from "./strata";

export type SimPosition = {shares: number; stratumId: number};
export type SimView = {tier: number; frozen: boolean; policyClears: boolean; now: number};
export type SimPlan = {branch: number; burnable: number; deferred: number; reason: number};

export function simulateResolve(
  v: SimView,
  positions: SimPosition[],
  strata: (Stratum & {minTier: number; lockUntil: number})[],
  requested: number,
): SimPlan {
  if (requested === 0) return {branch: 0, burnable: 0, deferred: 0, reason: 0};
  if (v.frozen) return {branch: 2, burnable: 0, deferred: requested, reason: 1};

  let remaining = requested;
  let burnable = 0;
  let reason = 0;
  let sawCandidate = false;

  for (let pass = 0; pass < 2 && remaining > 0; pass++) {
    const wantLocked = pass === 1;
    for (const p of positions) {
      if (remaining <= 0) break;
      if (p.shares === 0) continue;
      const s = strata[p.stratumId];
      if (!s) continue;
      sawCandidate = true;

      const locked = s.lockUntil > v.now;
      if (locked !== wantLocked) continue;
      if (s.blocked) { reason = 3; continue; }
      if (v.tier < s.minTier) { reason = 5; continue; }
      if (locked) { reason = 4; continue; }
      if (!v.policyClears) { reason = 2; continue; }

      const take = Math.min(p.shares, remaining);
      burnable += take;
      remaining -= take;
    }
  }

  if (!sawCandidate) reason = 6;
  if (remaining > 0 && reason === 0) reason = 7;

  const branch = burnable === requested ? 0 : burnable > 0 ? 1 : 2;
  return {branch, burnable, deferred: requested - burnable, reason: branch === 0 ? 0 : reason};
}
