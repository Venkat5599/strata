"use client";

import {fmtUsdc, type Stratum} from "@/lib/strata";

type Props = {
  strata: Stratum[];
  /** Shares highlighted as legally redeemable right now, drawn out of the bar. */
  burnable?: number;
  /** Shares of the request that cannot be satisfied. */
  deferred?: number;
};

/**
 * The stratum ledger.
 *
 * One horizontal bar is the pooled balance. It is segmented by stratum, each segment sized
 * in proportion to the shares held in it. A price tick sits above each segment, and the
 * bracket between the ticks is the compliance basis - the price gap between two legally
 * distinct claims on one identical asset.
 *
 * Everything renders at full opacity on first paint. Nothing here is revealed by an
 * animation, because a reveal that fails to fire renders an empty page, and an empty page
 * is worse than a static one.
 */
export function StratumLedger({strata, burnable = 0, deferred = 0}: Props) {
  const total = strata.reduce((n, s) => n + s.shares, 0);
  const empty = total === 0;

  const verified = strata.find((s) => s.id === 1);
  const open = strata.find((s) => s.id === 0);
  const basis = verified && open ? verified.priceBps - open.priceBps : 0;

  // Tick positions track the segment midpoints, so the bracket always spans the two prices
  // it is actually comparing rather than a fixed pair of coordinates. With no liquidity there
  // are no midpoints to track: every stratum would resolve to 0% and the labels would stack
  // on top of each other, so the empty pool gets its own state instead of a degenerate one.
  let acc = 0;
  const centres = strata.map((s) => {
    const c = empty ? 0 : ((acc + s.shares / 2) / total) * 100;
    acc += s.shares;
    return c;
  });

  // Keep adjacent ticks from overlapping when one stratum is very thin.
  const MIN_GAP = 11;
  for (let i = 1; i < centres.length; i++) {
    if (centres[i] - centres[i - 1] < MIN_GAP) centres[i] = centres[i - 1] + MIN_GAP;
  }
  const overflow = centres[centres.length - 1] - 94;
  if (overflow > 0) for (let i = 0; i < centres.length; i++) centres[i] -= overflow;

  const left = Math.min(...centres);
  const right = Math.max(...centres);
  const spans = strata.filter((s) => s.shares > 0).length > 1;

  const planned = burnable > 0 || deferred > 0;
  let remaining = burnable;

  return (
    <div className="ledger">
      <div className="ticks">
        {!empty && strata.map((s, i) => (
          <div className="tick" key={s.id} style={{left: `${centres[i]}%`}}>
            <div
              className="tick-price"
              style={{color: s.blocked ? "var(--blocked)" : s.id === 1 ? "var(--verified)" : "var(--open)"}}
            >
              {(s.priceBps / 100).toFixed(2)}
            </div>
            <div className="tick-label">{s.name}</div>
            <div className="tick-stem" />
          </div>
        ))}
      </div>

      <div className="bar" role="img" aria-label={`Pool balance split across ${strata.length} strata`}>
        {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
        {empty && <div className="bar-empty">no liquidity yet</div>}
        {!empty && strata.map((s) => {
          // The redeemable slice is carved out of the strata it is actually drawn from, in
          // order, consuming a running balance. Taking min(burnable, shares) per stratum
          // independently would let every stratum claim the same capacity and paint the whole
          // bar redeemable - which is precisely the claim the demo must not overstate.
          const redeemable = Math.min(Math.max(remaining, 0), s.shares);
          remaining -= redeemable;
          const rest = s.shares - redeemable;
          // Once a plan exists, whatever did not clear is deferred, not merely unhighlighted.
          const restIsDeferred = planned && rest > 0;

          return (
            <div key={s.id} style={{display: "flex", flexGrow: s.shares, minWidth: 0}}>
              {redeemable > 0 && (
                <div
                  className="seg seg-verified"
                  style={{flexGrow: redeemable, background: "var(--routed)", color: "#16130f"}}
                >
                  <span className="seg-name">REDEEMABLE</span>
                  <span className="seg-amount">{fmtUsdc(redeemable)}</span>
                </div>
              )}
              {rest > 0 && (
                <div
                  className={
                    "seg " +
                    (s.blocked
                      ? "seg-blocked"
                      : restIsDeferred
                        ? "seg-deferred"
                        : s.id === 1
                          ? "seg-verified"
                          : "seg-open")
                  }
                  style={{flexGrow: rest}}
                >
                  <span className="seg-name">
                    {s.blocked ? `${s.name} — BLOCKED` : restIsDeferred ? `${s.name} — DEFERRED` : s.name}
                  </span>
                  <span className="seg-amount">{fmtUsdc(rest)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {spans && (
        <div className="bracket-row">
          <div
            className="bracket"
            style={{width: `${Math.max(right - left, 6)}%`, marginLeft: `${left}%`}}
          />
          <span className="bracket-value">
            {basis >= 0 ? "+" : ""}
            {basis} bps
          </span>
          <span className="bracket-caption">
            compliance basis &mdash; what the transfer restriction costs
          </span>
        </div>
      )}
    </div>
  );
}
