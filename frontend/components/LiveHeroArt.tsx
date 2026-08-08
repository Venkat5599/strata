"use client";

// Live hero art: reads the real per-stratum split, prices and basis from the contract.
// Replaces the previously hardcoded 58/42 split and fixed ticker values - the numbers
// here are what the chain says, and an empty pool renders as an empty bar.

import {useReadContract} from "wagmi";
import {POOL} from "@/lib/contracts";
import {monadTestnet} from "@/lib/strata";
import {poolReadAbi} from "@/lib/strata";

export function LiveHeroArt() {
  const s0 = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "stratumTotalShares", args: [0], chainId: monadTestnet.id,
  }).data as bigint | undefined;
  const s1 = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "stratumTotalShares", args: [1], chainId: monadTestnet.id,
  }).data as bigint | undefined;
  const p0 = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "price", args: [0], chainId: monadTestnet.id,
  }).data as bigint | undefined;
  const p1 = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "price", args: [1], chainId: monadTestnet.id,
  }).data as bigint | undefined;
  const basis = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "basis", args: [1, 0], chainId: monadTestnet.id,
  }).data as bigint | undefined;

  const open = Number(s0 ?? 0n);
  const verified = Number(s1 ?? 0n);
  const total = open + verified;

  const openPct = total > 0 ? (open / total) * 100 : 50;
  const verifiedPct = total > 0 ? (verified / total) * 100 : 50;

  return (
    <div className="ef-artcard">
      <div className="art-ticks">
        <div className="art-tick" style={{left: `${Math.max(openPct / 2, 4)}%`}}>
          <span>{p0 === undefined ? "…" : (Number(p0) / 100).toFixed(2)}</span>
          <i>OPEN</i>
        </div>
        <div className="art-tick verified" style={{left: `${Math.min(100 - verifiedPct / 2, 96)}%`}}>
          <span>{p1 === undefined ? "…" : (Number(p1) / 100).toFixed(2)}</span>
          <i>VERIFIED</i>
        </div>
      </div>
      <div className="art-bar">
        {total === 0 ? (
          <div className="art-seg art-open" style={{flexGrow: 1}}>OPEN<b>0</b></div>
        ) : (
          <>
            <div className="art-seg art-open" style={{flexGrow: open}}>OPEN<b>{open}</b></div>
            <div className="art-seg art-verified" style={{flexGrow: verified}}>VERIFIED<b>{verified}</b></div>
          </>
        )}
      </div>
      <div className="art-bracket-row">
        <div className="art-bracket" />
        <span className="art-basis">{basis === undefined ? "…" : `+${Number(basis)} bps`}</span>
      </div>
      <div className="ef-artcard-cap">the compliance basis, priced on-chain</div>
    </div>
  );
}
