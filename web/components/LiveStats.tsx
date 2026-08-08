"use client";

import {useReadContract} from "wagmi";
import {POOL, poolWriteAbi} from "@/lib/contracts";
import {monadTestnet} from "@/lib/strata";

export function LiveStats() {
  const price = (id: number) =>
    useReadContract({address: POOL, abi: poolWriteAbi, functionName: "price", args: [id], chainId: monadTestnet.id});

  const pOpen = price(0).data;
  const pVerified = price(1).data;
  const basis = useReadContract({
    address: POOL, abi: poolWriteAbi, functionName: "basis", args: [1, 0], chainId: monadTestnet.id,
  }).data;

  const cell = (label: string, value: string, tone?: string) => (
    <div className="stat">
      <div className="stat-value" style={tone ? {color: tone} : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <div className="stats" role="group" aria-label="Live contract reads">
      {cell("OPEN price", pOpen === undefined ? "…" : (Number(pOpen) / 100).toFixed(2))}
      {cell("VERIFIED price", pVerified === undefined ? "…" : (Number(pVerified) / 100).toFixed(2), "var(--verified)")}
      {cell("compliance basis", basis === undefined ? "…" : `+${Number(basis)} bps`, "var(--verified)")}
      <div className="stat">
        <div className="stat-value" style={{display: "flex", alignItems: "center", gap: 8}}>
          <span className="live-dot" /> live
        </div>
        <div className="stat-label">read from chain</div>
      </div>
    </div>
  );
}
