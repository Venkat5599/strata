"use client";

import {useReadContract} from "wagmi";
import {POOL} from "@/lib/contracts";
import {monadTestnet} from "@/lib/strata";
import {poolReadAbi} from "@/lib/strata";
import {CLEANVERSE} from "@/lib/strata";

const erc20BalanceAbi = [
  {type: "function", name: "balanceOf", stateMutability: "view",
   inputs: [{name: "account", type: "address"}], outputs: [{name: "", type: "uint256"}]},
] as const;

export function LiveStats() {
  const price = (id: number) =>
    useReadContract({address: POOL, abi: poolReadAbi, functionName: "price", args: [id], chainId: monadTestnet.id});

  const pOpen = price(0).data;
  const pVerified = price(1).data;
  const basis = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "basis", args: [1, 0], chainId: monadTestnet.id,
  }).data;
  const totalSupply = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "totalSupply", args: [], chainId: monadTestnet.id,
  }).data;
  const usdcHeld = useReadContract({
    address: CLEANVERSE.usdc, abi: erc20BalanceAbi, functionName: "balanceOf", args: [POOL], chainId: monadTestnet.id,
  }).data;
  const ausdcHeld = useReadContract({
    address: CLEANVERSE.ausdc, abi: erc20BalanceAbi, functionName: "balanceOf", args: [POOL], chainId: monadTestnet.id,
  }).data;

  const cell = (label: string, value: string, tone?: string) => (
    <div className="stat">
      <div className="stat-value" style={tone ? {color: tone} : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  const fmt = (v: bigint | undefined) =>
    v === undefined ? "…" : (Number(v) / 1e6).toLocaleString(undefined, {maximumFractionDigits: 2});

  return (
    <div className="stats" role="group" aria-label="Live contract reads">
      {cell("OPEN price", pOpen === undefined ? "…" : (Number(pOpen) / 100).toFixed(2))}
      {cell("VERIFIED price", pVerified === undefined ? "…" : (Number(pVerified) / 100).toFixed(2), "var(--verified)")}
      {cell("compliance basis", basis === undefined ? "…" : `${Number(basis)} bps`, "var(--verified)")}
      {cell("shares outstanding", fmt(totalSupply))}
      {cell("dUSDC held", fmt(usdcHeld))}
      {cell("aUSDC held", fmt(ausdcHeld), "var(--verified)")}
      <div className="stat">
        <div className="stat-value" style={{display: "flex", alignItems: "center", gap: 8}}>
          <span className="live-dot" /> live
        </div>
        <div className="stat-label">read from chain</div>
      </div>
    </div>
  );
}
