"use client";

import {useEffect, useMemo, useState} from "react";
import {useReadContract} from "wagmi";
import {POOL} from "@/lib/contracts";
import {poolReadAbi} from "@/lib/strata";

// The whole invention, interactive, no wallet needed:
// previewExit is a VIEW on the pool — it grades a real exit request against live
// chain state (the account's credential, the pool's strata, the policy) and
// returns Direct / Routed / Blocked with the burnable/deferred split.
//
// Every number here is read from the chain at render time:
//   - the participants are the pool's real holders (from its event history)
//   - each balance is a live balanceOf read
//   - the verdict is a live previewExit call
// Nothing is hardcoded except the account addresses, which are the actual
// on-chain depositors.

const PARTICIPANT_ADDRS = [
  {addr: "0x483C8C23B2D518a8708c8FabDaF1AE68D7Bed389", label: "Verified LP (holds an A-Pass)"},
  {addr: "0xA4B9960bc968B487337EF3b16fE823A0D950067C", label: "Unverified LP (no credential)"},
  {addr: "0xEa3a73e61e63d196012c51c10282C576289aace6", label: "Mixed LP (OPEN + VERIFIED lots)"},
] as const;

const BRANCH = ["Direct", "Routed", "Blocked"] as const;

export function ExitResolver() {
  const [who, setWho] = useState(0);
  const [pct, setPct] = useState(100);

  const participant = PARTICIPANT_ADDRS[who];

  // Live balance read — the slider's ceiling is the holder's actual position.
  const balance = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "balanceOf",
    args: [participant.addr],
  }).data as bigint | undefined;

  const balanceUsdc = balance === undefined ? 0 : Number(balance) / 1e6;
  const requested = useMemo(
    () => balance === undefined ? 0n : (balance * BigInt(pct)) / 100n,
    [balance, pct]
  );

  const plan = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "previewExit",
    args: [participant.addr, requested],
  }).data as {branch: number; burnable: bigint; deferred: bigint; reason: number} | undefined;

  const burnable = Number(plan?.burnable ?? 0n) / 1e6;
  const deferred = Number(plan?.deferred ?? 0n) / 1e6;
  const branch = BRANCH[plan?.branch ?? 0];

  return (
    <div className="resolver">
      <div className="resolver-controls">
        <div className="resolver-who">
          {PARTICIPANT_ADDRS.map((p, i) => (
            <button key={p.addr} className={`resolver-pill ${i === who ? "on" : ""}`} onClick={() => setWho(i)}>
              <span className="pill-dot" />
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
          <span className="resolver-amt">{balance === undefined ? "…" : `${Math.round((balanceUsdc * pct) / 100).toLocaleString()} dUSDC`}</span>
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

      <p className="resolver-foot">Live view calls on the pool contract — no wallet, no gas, no signature. The participant list is the pool's real holder set, each balance is a live <code>balanceOf</code> read, and every verdict is a live <code>previewExit</code> call. The same grading runs inside <code>withdraw()</code> when you sign one.</p>
    </div>
  );
}
