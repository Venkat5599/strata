"use client";

import {useEffect, useMemo, useState} from "react";
import {useReadContract} from "wagmi";
import {POOL} from "@/lib/contracts";
import {poolReadAbi} from "@/lib/strata";
import {usePoolLogs, EVENT_TOPICS, wordAt} from "@/lib/poolEvents";

// The whole invention, interactive, no wallet needed:
// previewExit is a VIEW on the pool — it grades a real exit request against live
// chain state and returns Direct / Routed / Blocked with the burnable/deferred
// split.
//
// Everything is derived from the chain at render time:
//   - participants = the pool's real depositors, extracted from its event logs
//     (the Deposited event's indexed account) — nothing hardcoded
//   - each balance is a live balanceOf read
//   - each credential state is a live credentialOf read
//   - the verdict is a live previewExit call

const BRANCH = ["Direct", "Routed", "Blocked"] as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ExitResolver() {
  const {logs} = usePoolLogs();
  const [who, setWho] = useState(0);
  const [pct, setPct] = useState(100);

  // Unique depositors from real Deposited / DepositedAToken events. topics are
  // [sig, cviRef, account, ...] so the account is topics[2].
  const holders = useMemo(() => {
    const seen = new Set<string>();
    const out: {addr: `0x${string}`}[] = [];
    for (const log of logs) {
      if (log.topics?.[0] !== EVENT_TOPICS.DEPOSITED && log.topics?.[0] !== EVENT_TOPICS.DEPOSITED_ATOKEN) continue;
      const acct = ("0x" + (log.topics?.[2] ?? "").slice(-40)) as `0x${string}`;
      if (!seen.has(acct)) {
        seen.add(acct);
        out.push({addr: acct});
      }
    }
    return out;
  }, [logs]);

  const participant = holders[Math.min(who, Math.max(0, holders.length - 1))];

  // Live balance read — the slider's ceiling is the holder's actual position.
  const balance = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "balanceOf",
    args: participant ? [participant.addr] : undefined,
  }).data as bigint | undefined;

  // Live credential read — labels the participant honestly.
  const cred = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "credentialOf",
    args: participant ? [participant.addr] : undefined,
  }).data as [string, number] | undefined;

  const balanceUsdc = balance === undefined ? 0 : Number(balance) / 1e6;
  const requested = useMemo(
    () => balance === undefined ? 0n : (balance * BigInt(pct)) / 100n,
    [balance, pct]
  );

  const plan = useReadContract({
    address: POOL,
    abi: poolReadAbi,
    functionName: "previewExit",
    args: participant && requested > 0n ? [participant.addr, requested] : undefined,
  }).data as {branch: number; burnable: bigint; deferred: bigint; reason: number} | undefined;

  const burnable = Number(plan?.burnable ?? 0n) / 1e6;
  const deferred = Number(plan?.deferred ?? 0n) / 1e6;
  const branch = BRANCH[plan?.branch ?? 0];

  if (holders.length === 0) {
    return <p className="feed-empty">no depositors yet — the pool's holders appear here as they deposit.</p>;
  }

  return (
    <div className="resolver">
      <div className="resolver-controls">
        <div className="resolver-who">
          {holders.map((h, i) => (
            <button key={h.addr} className={`resolver-pill ${i === who ? "on" : ""}`} onClick={() => setWho(i)}>
              <span className="pill-dot" />
              {short(h.addr)}{cred && i === who ? (cred[1] > 0 ? " · verified" : " · no credential") : ""}
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

      <p className="resolver-foot">Live view calls on the pool contract — no wallet, no gas, no signature. The participant list is derived from the pool's real deposit events, balances are live <code>balanceOf</code> reads, and every verdict is a live <code>previewExit</code> call. The same grading runs inside <code>withdraw()</code> when you sign one.</p>
    </div>
  );
}
