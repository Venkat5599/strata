"use client";

import {useEffect, useMemo, useState} from "react";
import {StratumLedger} from "@/components/StratumLedger";
import {BRANCH, CLEANVERSE, POOL_ADDRESS, REASON, fmtUsdc, type Stratum} from "@/lib/strata";
import {simulateResolve} from "@/lib/simulate";

type Sx = Stratum & {minTier: number; lockUntil: number};

const INITIAL: Sx[] = [
  {id: 0, name: "OPEN", shares: 0, priceBps: 9750, blocked: false, minTier: 0, lockUntil: 0},
  {id: 1, name: "VERIFIED", shares: 0, priceBps: 9975, blocked: false, minTier: 1, lockUntil: 0},
];

export default function Page() {
  const [strata, setStrata] = useState<Sx[]>(INITIAL);
  const [plan, setPlan] = useState<{
    branch: number;
    burnable: number;
    deferred: number;
    reason: number;
  } | null>(null);
  const [step, setStep] = useState(0);

  const total = strata.reduce((n, s) => n + s.shares, 0);
  const live = POOL_ADDRESS !== "";

  // Beat 1. Two LPs deposit into the same pool and land in different strata.
  const depositBoth = () => {
    setStrata((s) => s.map((x) => ({...x, shares: x.id === 0 ? 58_000_000 : 42_000_000})));
    setPlan(null);
    setStep(1);
  };

  // Beat 2. The unverified LP asks to exit everything. Only the OPEN portion clears.
  const requestFullExit = () => {
    const positions = strata.map((s) => ({shares: s.shares, stratumId: s.id}));
    const p = simulateResolve(
      {tier: 0, frozen: false, policyClears: true, now: Math.floor(Date.now() / 1000)},
      positions,
      strata,
      total,
    );
    setPlan(p);
    setStep(2);
  };

  // Beat 3. The credential is revoked upstream; the stratum blocks and the basis widens.
  const revoke = () => {
    setStrata((s) => s.map((x) => (x.id === 1 ? {...x, blocked: true, priceBps: 0} : x)));
    setPlan(null);
    setStep(3);
  };

  const reset = () => {
    setStrata(INITIAL);
    setPlan(null);
    setStep(0);
  };

  // Deep-linkable demo beats: /?beat=2 lands directly on the routed exit. Useful for
  // recording the demo and for anyone reviewing a single claim without clicking through.
  useEffect(() => {
    const beat = Number(new URLSearchParams(window.location.search).get("beat") ?? 0);
    if (beat >= 1) {
      const seeded = INITIAL.map((x) => ({...x, shares: x.id === 0 ? 58_000_000 : 42_000_000}));
      const sum = seeded.reduce((n, x) => n + x.shares, 0);

      if (beat >= 3) {
        setStrata(seeded.map((x) => (x.id === 1 ? {...x, blocked: true, priceBps: 0} : x)));
        setPlan(null);
        setStep(3);
        return;
      }
      setStrata(seeded);
      if (beat === 2) {
        setPlan(
          simulateResolve(
            {tier: 0, frozen: false, policyClears: true, now: Math.floor(Date.now() / 1000)},
            seeded.map((x) => ({shares: x.shares, stratumId: x.id})),
            seeded,
            sum,
          ),
        );
        setStep(2);
      } else {
        setStep(1);
      }
    }
  }, []);

  const pct = useMemo(
    () => (plan && total > 0 ? Math.round((plan.burnable / total) * 100) : 0),
    [plan, total],
  );

  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="wordmark">STRATA</h1>
        <span className="chain">monad testnet · 10143 · {live ? "live" : "simulated"}</span>
      </header>

      <h2 className="claim">
        One pool. <em>Many legal strata.</em>
      </h2>
      <p className="standfirst">
        A liquidity pool socializes ownership, so one unverified holder taints the whole book. The
        usual answer is to gate the pool, which fragments identical assets into thin silos. STRATA
        moves the boundary onto the position: an exit is graded, not refused.
      </p>

      <StratumLedger strata={strata} burnable={plan?.burnable ?? 0} deferred={plan?.deferred ?? 0} />

      {plan && (
        <div className="plan">
          <div className="plan-head">
            <span className={`plan-branch branch-${BRANCH[plan.branch]}`}>
              {BRANCH[plan.branch]}
              {plan.branch === 1 ? ` - ${pct}% redeemable` : ""}
            </span>
            <span className="plan-detail">
              {fmtUsdc(plan.burnable)} of {fmtUsdc(plan.burnable + plan.deferred)} USDC settles now
            </span>
          </div>
          <p className="plan-reason">
            {plan.branch === 1 ? (
              <>
                The remaining <b>{fmtUsdc(plan.deferred)} USDC</b> is not refused, it is deferred:{" "}
                <b>{REASON[plan.reason]}</b>. A pool-level gate would have reverted the entire call.
              </>
            ) : plan.branch === 2 ? (
              <>
                No legal path right now: <b>{REASON[plan.reason]}</b>. The attempt is still recorded
                on-chain.
              </>
            ) : (
              <>Every restriction cleared. The whole position settles in one call.</>
            )}
          </p>
        </div>
      )}

      <div className="controls">
        <button className="act" onClick={depositBoth} disabled={step > 0}>
          1 · Two LPs deposit
        </button>
        <button className="act" onClick={requestFullExit} disabled={step !== 1}>
          2 · Unverified LP exits in full
        </button>
        <button className="act" data-tone="danger" onClick={revoke} disabled={step !== 2}>
          3 · Revoke the credential
        </button>
        <button className="act" onClick={reset}>
          Reset
        </button>
      </div>

      {!live && (
        <p className="mode-flag">
          simulated — set NEXT_PUBLIC_POOL_ADDRESS to read previewExit from the deployed contract
        </p>
      )}

      <section className="notes">
        <div className="note">
          <h3>CVI · A-PASS</h3>
          <p>
            Stratum membership reads the on-chain credential, not the wallet. A fresh address
            inherits nothing.
            <br />
            <code>{CLEANVERSE.apass}</code>
          </p>
        </div>
        <div className="note">
          <h3>POLICY</h3>
          <p>
            <code>canTransfer</code> reverts rather than returning false for an uncredentialled
            party. STRATA catches that and grades it.
            <br />
            <code>{CLEANVERSE.policy}</code>
          </p>
        </div>
        <div className="note">
          <h3>CVA · A-TOKEN</h3>
          <p>
            aUSDC is the registered instrument every policy question is denominated in.
            <br />
            <code>{CLEANVERSE.ausdc}</code>
          </p>
        </div>
        <div className="note">
          <h3>BASIS</h3>
          <p>
            The gap between two strata is the first live on-chain price for what a transfer
            restriction costs an issuer.
          </p>
        </div>
      </section>
    </main>
  );
}
