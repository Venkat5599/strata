"use client";

import {useReadContract} from "wagmi";
import {POOL, CVA} from "@/lib/contracts";
import {POOL_ADDRESS, monadTestnet, poolReadAbi, CLEANVERSE} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";

const BAL_ABI = [
  {type: "function", name: "balanceOf", stateMutability: "view",
   inputs: [{name: "account", type: "address"}], outputs: [{name: "", type: "uint256"}]},
] as const;

function Row({label, value, tone}: {label: string; value: string; tone?: string}) {
  return (
    <div className="side-row">
      <span className="side-row-label">{label}</span>
      <span className="side-row-value" style={tone ? {color: tone} : undefined}>{value}</span>
    </div>
  );
}

export function SidebarStatus({wide}: {wide?: boolean}) {
  const pOpen = useReadContract({address: POOL, abi: poolReadAbi, functionName: "price", args: [0], chainId: monadTestnet.id}).data as bigint | undefined;
  const pVerified = useReadContract({address: POOL, abi: poolReadAbi, functionName: "price", args: [1], chainId: monadTestnet.id}).data as bigint | undefined;
  const basis = useReadContract({address: POOL, abi: poolReadAbi, functionName: "basis", args: [1, 0], chainId: monadTestnet.id}).data as bigint | undefined;
  const totalSupply = useReadContract({address: POOL, abi: poolReadAbi, functionName: "totalSupply", args: [], chainId: monadTestnet.id}).data as bigint | undefined;
  const dusdc = useReadContract({address: CLEANVERSE.usdc, abi: BAL_ABI, functionName: "balanceOf", args: [POOL_ADDRESS], chainId: monadTestnet.id}).data as bigint | undefined;
  const cva = useReadContract({address: CVA, abi: BAL_ABI, functionName: "balanceOf", args: [POOL_ADDRESS], chainId: monadTestnet.id}).data as bigint | undefined;

  const fmt = (v: bigint | undefined) => v === undefined ? "…" : (Number(v) / 1e6).toLocaleString(undefined, {maximumFractionDigits: 0});
  const price = (v: bigint | undefined) => v === undefined ? "…" : (Number(v) / 100).toFixed(2);

  return (
    <div className={wide ? "side-status wide" : "side-status"}>
      <div className="side-status-head">
        <span className="live-dot" /> live
        <span className="side-status-sub">every row is a contract read</span>
      </div>
      <div className="side-status-grid">
        <Row label="OPEN" value={price(pOpen)} />
        <Row label="VERIFIED" value={price(pVerified)} tone="var(--verified)" />
        <Row label="basis" value={basis === undefined ? "…" : `${Number(basis)} bps`} tone="var(--verified)" />
        <Row label="shares" value={fmt(totalSupply)} />
        <Row label="dUSDC held" value={fmt(dusdc)} />
        <Row label="sCVA custodied" value={fmt(cva)} tone="var(--verified)" />
      </div>
      <a className="side-pool" href={EXPLORER_ADDR(POOL_ADDRESS)} target="_blank" rel="noreferrer">
        {POOL_ADDRESS.slice(0, 8)}…{POOL_ADDRESS.slice(-6)} ↗
      </a>
    </div>
  );
}
