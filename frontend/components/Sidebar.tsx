"use client";

import Link from "next/link";
import {useReadContract} from "wagmi";
import {SidebarStatus} from "./SidebarStatus";
import {POOL_ADDRESS} from "@/lib/strata";
import {APASS, POLICY, AUSDC} from "@/lib/contracts";

const NAV = [
  {href: "#overview", label: "Overview"},
  {href: "#ledger", label: "Stratum ledger"},
  {href: "#resolver", label: "Exit resolver"},
  {href: "#activity", label: "Pool activity"},
  {href: "#contracts", label: "Contracts"},
];

const APASS_ABI = [{type: "function", name: "balanceOf", stateMutability: "view", inputs: [{name: "a", type: "address"}], outputs: [{name: "", type: "uint256"}]}] as const;
const POLICY_ABI = [
  {type: "function", name: "isTokenRegistered", stateMutability: "view", inputs: [{name: "token", type: "address"}], outputs: [{name: "", type: "bool"}]},
  {type: "function", name: "isPaused", stateMutability: "view", inputs: [{name: "token", type: "address"}], outputs: [{name: "", type: "bool"}]},
] as const;

function WiringRow({label, ok, text}: {label: string; ok: boolean | null; text: string}) {
  const state = ok === null ? "pending" : ok ? "ok" : "bad";
  return (
    <div className={`wire-row ${state}`}>
      <span className="chip-dot" />
      <span className="wire-row-label">{label}</span>
      <span className="wire-row-text">{ok === null ? "reading…" : text}</span>
    </div>
  );
}

export function Sidebar() {
  const poolApass = useReadContract({address: APASS, abi: APASS_ABI, functionName: "balanceOf", args: [POOL_ADDRESS]}).data as bigint | undefined;
  const registered = useReadContract({address: POLICY, abi: POLICY_ABI, functionName: "isTokenRegistered", args: [AUSDC]}).data as boolean | undefined;
  const paused = useReadContract({address: POLICY, abi: POLICY_ABI, functionName: "isPaused", args: [AUSDC]}).data as boolean | undefined;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link href="/" className="sidebar-brand">STRATA</Link>
        <div className="sidebar-sub">compliance-partitioned liquidity</div>

        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="sidebar-link">{n.label}</a>
          ))}
        </nav>
      </div>

      <div className="sidebar-status">
        <SidebarStatus />

        <div className="side-wiring">
          <div className="side-wiring-head">compliance wiring</div>
          <WiringRow label="pool A-Pass" ok={poolApass !== undefined && poolApass > 0n} text={`balanceOf == ${poolApass === undefined ? "…" : poolApass.toString()}`} />
          <WiringRow label="aUSDC registered" ok={registered === undefined ? null : registered} text={registered === undefined ? "…" : registered ? "true" : "NOT registered"} />
          <WiringRow label="policy paused" ok={paused === undefined ? null : !paused} text={paused === undefined ? "…" : paused ? "true" : "false"} />
        </div>
      </div>
    </aside>
  );
}
