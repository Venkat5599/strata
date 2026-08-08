"use client";

import {useMemo, useState} from "react";
import {StratumLedger} from "@/components/StratumLedger";
import {LiveStats} from "@/components/LiveStats";
import {BRANCH, CLEANVERSE, POOL_ADDRESS, REASON, fmtUsdc, type Stratum} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";
import {simulateResolve} from "@/lib/simulate";

type Sx = Stratum & {minTier: number; lockUntil: number};
const INITIAL: Sx[] = [
  {id: 0, name: "OPEN", shares: 0, priceBps: 9750, blocked: false, minTier: 0, lockUntil: 0},
  {id: 1, name: "VERIFIED", shares: 0, priceBps: 9975, blocked: false, minTier: 1, lockUntil: 0},
];

export default function Dashboard() {
  const [strata, setStrata] = useState<Sx[]>(INITIAL);
  const [plan, setPlan] = useState<{branch: number; burnable: number; deferred: number; reason: number} | null>(null);
  const [step, setStep] = useState(0);
  const total = strata.reduce((n, s) => n + s.shares, 0);

  const deposit = () => {
    setStrata((s) => s.map((x) => ({...x, shares: x.id === 0 ? 58_000_000 : 42_000_000})));
    setPlan(null); setStep(1);
  };
  const exit = () => {
    const p = simulateResolve(
      {tier: 0, frozen: false, policyClears: true, now: Math.floor(Date.now() / 1000)},
      strata.map((s) => ({shares: s.shares, stratumId: s.id})), strata, total);
    setPlan(p); setStep(2);
  };
  const revoke = () => {
    setStrata((s) => s.map((x) => (x.id === 1 ? {...x, blocked: true, priceBps: 0} : x)));
    setPlan(null); setStep(3);
  };
  const reset = () => { setStrata(INITIAL); setPlan(null); setStep(0); };
  const pct = useMemo(() => (plan && total > 0 ? Math.round((plan.burnable / total) * 100) : 0), [plan, total]);

  return (
    <div className="dash-content">
      <header className="dash-header" id="overview">
        <div>
          <h1>Overview</h1>
          <p>A live, position-scoped compliance pool on Monad testnet.</p>
        </div>
        <a className="dash-pool" href={EXPLORER_ADDR(POOL_ADDRESS || CLEANVERSE.policy)} target="_blank" rel="noreferrer">
          pool {POOL_ADDRESS ? `${POOL_ADDRESS.slice(0, 8)}…${POOL_ADDRESS.slice(-6)}` : "—"} ↗
        </a>
      </header>

      <LiveStats />

      <section className="panel" id="ledger">
        <div className="panel-head">
          <h2>Stratum ledger</h2>
          <span className="panel-note">simulated walkthrough — the on-chain reads above are live</span>
        </div>

        <StratumLedger strata={strata} burnable={plan?.burnable ?? 0} deferred={plan?.deferred ?? 0} />

        {plan && (
          <div className="plan">
            <div className="plan-head">
              <span className={`plan-branch branch-${BRANCH[plan.branch]}`}>
                {BRANCH[plan.branch]}{plan.branch === 1 ? ` — ${pct}% redeemable` : ""}
              </span>
              <span className="plan-detail">
                {fmtUsdc(plan.burnable)} of {fmtUsdc(plan.burnable + plan.deferred)} USDC settles now
              </span>
            </div>
            <p className="plan-reason">
              {plan.branch === 1 ? (
                <>The remaining <b>{fmtUsdc(plan.deferred)} USDC</b> is not refused, it is deferred: <b>{REASON[plan.reason]}</b>. A pool-level gate would have reverted the entire call.</>
              ) : plan.branch === 2 ? (
                <>No legal path right now: <b>{REASON[plan.reason]}</b>. The attempt is still recorded on-chain.</>
              ) : (<>Every restriction cleared. The whole position settles in one call.</>)}
            </p>
          </div>
        )}

        <div className="controls">
          <button className="act" onClick={deposit} disabled={step > 0}>1 · Two LPs deposit</button>
          <button className="act" onClick={exit} disabled={step !== 1}>2 · Unverified LP exits in full</button>
          <button className="act" data-tone="danger" onClick={revoke} disabled={step !== 2}>3 · Revoke the credential</button>
          <button className="act" onClick={reset}>Reset</button>
        </div>
      </section>

      <section className="panel" id="compliance">
        <div className="panel-head"><h2>Compliance wiring</h2></div>
        <div className="wiring">
          <div className="wire"><h3>CVI · A-PASS</h3><p>Stratum membership reads the on-chain credential, not the wallet. A fresh address inherits nothing.</p></div>
          <div className="wire"><h3>POLICY</h3><p><code>canTransfer</code> reverts rather than returning false for an uncredentialled party. STRATA catches that and grades it.</p></div>
          <div className="wire"><h3>CVA · A-TOKEN</h3><p>aUSDC is the registered instrument every policy question is denominated in, and is custodied by <code>depositAToken</code>.</p></div>
          <div className="wire"><h3>BASIS</h3><p>The gap between two strata is the first live on-chain price for what a transfer restriction costs an issuer.</p></div>
        </div>
      </section>

      <section className="panel" id="contracts">
        <div className="panel-head"><h2>Deployed contracts</h2><span className="panel-note">Monad testnet · 10143</span></div>
        <div className="addrs">
          {[["StrataPool", POOL_ADDRESS], ["USDC (pooled)", CLEANVERSE.usdc], ["aUSDC (CVA)", CLEANVERSE.ausdc],
            ["A-Pass (CVI)", CLEANVERSE.apass], ["Policy", CLEANVERSE.policy]].map(([label, addr]) => (
            <a key={label} className="addr-row" href={EXPLORER_ADDR(addr as string)} target="_blank" rel="noreferrer">
              <span className="addr-label">{label}</span>
              <code>{addr || "—"}</code>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
