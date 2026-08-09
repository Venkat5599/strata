"use client";

import {useEffect, useMemo, useState} from "react";
import {useReadContract} from "wagmi";
import {POOL} from "@/lib/contracts";
import {poolReadAbi} from "@/lib/strata";

// The whole invention, interactive, no wallet needed:
// previewExit is a VIEW on the pool — it grades a real exit request against live
// chain state (the account's credential, the pool's strata, the policy) and
// returns Direct / Routed / Blocked with the burnable/deferred split.
// A reviewer can drive this from the page without connecting or signing anything.

const PARTICIPANTS = [
  {
    label: "Verified LP (A-Pass, VERIFIED stratum is revoked)",
    addr: "0x483C8C23B2D518a8708c8FabDaF1AE68D7Bed389",
    balance: 250_000,
    color: "var(--verified)",
  },
  {
    label: "Unverified LP (no credential)",
    addr: "0xA4B9960bc968B487337EF3b16fE823A0D950067C",
    balance: 150_000,
    color: "var(--open)",
  },
  {
    label: "Mixed LP (OPEN + VERIFIED)",
    addr: "0xEa3a73e61e63d196012c51c10282C576289aace6",
    balance: 120_000,
    color: "#c62828",
  },
] as const;

const BRANCH = ["Direct", "Routed", "Blocked"] as const;

export function ExitResolver() {
  const [who, setWho] = useState(0);
  const [pct, setPct] = useState(100);

  const participant = PARTICIPANTS[who];
  const shares = useMemo(() => BigInt(Math.round((participant.balance * pct) / 100)) * 1_000_000n, [participant, pct]);

  const plan = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "previewExit",
    args: [participant.addr, shares],
  }).data as {branch: number; burnable: bigint; deferred: bigint; reason: number} | undefined;

  const burnable = Number(plan?.burnable ?? 0n) / 1e6;
  const deferred = Number(plan?.deferred ?? 0n) / 1e6;
  const branch = BRANCH[plan?.branch ?? 0];

  return (
    <div className="resolver">
      <div className="resolver-controls">
        <div className="resolver-who">
          {PARTICIPANTS.map((p, i) => (
            <button key={p.addr} className={`resolver-pill ${i === who ? "on" : ""}`} onClick={() => setWho(i)}>
              <span className="pill-dot" style={{background: p.color}} />
              {p.label}
            </button>
          ))}
        </div>
        <div className="resolver-slider">
          <span>Exit request</span>
          <input
            type="range" min={5} max={100} step={5} value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label="exit percent"
          />
          <span className="resolver-amt">{((participant.balance * pct) / 100).toLocaleString()} dUSDC</span>
        </div>
      </div>

      <div className={`resolver-verdict verdict-${branch.toLowerCase()}`}>
        <div className="verdict-label">Resolver grades it</div>
        <div className="verdict-branch">{branch}</div>
        <div className="verdict-split">
          <span><strong>{burnable.toLocaleString()}</strong> dUSDC redeemable now</span>
          <span className="dim">·</span>
          <span><strong>{deferred.toLocaleString()}</strong> dUSDC deferred</span>
        </div>
        <p className="verdict-note">
          {branch === "Direct" && "The whole request clears the compliance checks — it settles immediately."}
          {branch === "Routed" && "A strict subset clears. Only that part settles; the rest waits — a partial, not a revert."}
          {branch === "Blocked" && "Nothing clears right now. The pool records why and defers the full amount — no revert, no silent failure."}
        </p>
      </div>

      <p className="resolver-foot">This is a live view call on the pool contract — no wallet, no gas, no signature. The same grading runs inside <code>withdraw()</code> when you sign one. The VERIFIED stratum was revoked on-chain (<code>setStratumBlocked</code> tx <code>0x073f9e04…</code>), which is why even the verified LP is deferred and the basis widened.</p>
    </div>
  );
}
