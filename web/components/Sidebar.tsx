"use client";

import Link from "next/link";
import {WalletPanel} from "./WalletPanel";

const NAV = [
  {href: "#overview", label: "Overview"},
  {href: "#ledger", label: "Stratum ledger"},
  {href: "#compliance", label: "Compliance"},
  {href: "#contracts", label: "Contracts"},
];

export function Sidebar() {
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

      <WalletPanel />
    </aside>
  );
}
