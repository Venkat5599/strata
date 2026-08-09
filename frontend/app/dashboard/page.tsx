"use client";

import {useMemo} from "react";
import {useReadContract} from "wagmi";
import {StratumLedger} from "@/components/StratumLedger";
import {WalletPanel} from "@/components/WalletPanel";
import {ActivityFeed} from "@/components/ActivityFeed";
import {ExitResolver} from "@/components/ExitResolver";
import {POOL_ADDRESS, type Stratum} from "@/lib/strata";
import {POOL} from "@/lib/contracts";
import {poolReadAbi} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";

// The ledger is driven entirely by on-chain state. Stratum totals come from the
// stratumTotalShares counter the contract maintains (sum == totalSupply, invariant-tested);
// prices come from price()/basis(). Nothing is simulated.
const STRATA: {id: number; name: string}[] = [
  {id: 0, name: "OPEN"},
  {id: 1, name: "VERIFIED"},
];

function useStratum(id: number) {
  const shares = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "stratumTotalShares", args: [id],
  }).data as bigint | undefined;
  const priceBps = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "price", args: [id],
  }).data as bigint | undefined;
  const state = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "stratum", args: [id],
  }).data as {minTier: number; lockUntil: bigint; blocked: boolean} | undefined;

  return {shares, priceBps, blocked: state?.blocked ?? false};
}

export default function Dashboard() {
  const s0 = useStratum(0);
  const s1 = useStratum(1);

  const strata: Stratum[] = useMemo(() =>
    STRATA.map((s) => {
      const st = s.id === 0 ? s0 : s1;
      return {
        id: s.id,
        name: s.name,
        shares: Number(st.shares ?? 0n),
        priceBps: Number(st.priceBps ?? 0n),
        blocked: st.blocked,
      };
    }), [s0, s1]);

  const total = strata.reduce((n, s) => n + s.shares, 0);

  return (
    <div className="dash-content">
      <header className="dash-header" id="overview">
        <div>
          <h1>Overview</h1>
          <p>A live, position-scoped compliance pool on Monad testnet.</p>
        </div>
        <a className="dash-pool" href={EXPLORER_ADDR(POOL_ADDRESS)} target="_blank" rel="noreferrer">
          pool {POOL_ADDRESS.slice(0, 8)}…{POOL_ADDRESS.slice(-6)} ↗
        </a>
      </header>

      <section className="panel demo-guide">
        <div className="panel-head">
          <h2>Try it — 60 seconds</h2>
          <span className="panel-note">all real transactions on Monad testnet</span>
        </div>
        <ol className="guide-steps">
          <li><strong>Connect wallet</strong> (Monad testnet — add it via MetaMask if needed, get MON at{" "}
            <a href="https://testnet.monad.xyz/faucet" target="_blank" rel="noreferrer">the faucet</a>).</li>
          <li><strong>Mint 10k dUSDC</strong>, then deposit — watch the ledger split as your shares land in a stratum.</li>
          <li><strong>Preview an exit</strong> before signing — the resolver grades it Direct / Routed / Blocked, live.</li>
        </ol>
        <a className="guide-cta" href="#position">Jump to your position ↓</a>
      </section>

      <section className="panel" id="ledger">
        <div className="panel-head">
          <h2>Stratum ledger</h2>
          <span className="panel-note">
            {total > 0 ? "on-chain state" : "empty pool — deposits appear here live"}
          </span>
        </div>

        <StratumLedger strata={strata} />

        {total === 0 && (
          <div className="plan plan-idle">
            <p>
              The pool currently holds no liquidity. Connect a wallet and deposit dUSDC or
              aUSDC (with an A-Pass) to see the ledger populate from the contract.
            </p>
          </div>
        )}
      </section>

      <section className="panel" id="resolver">
        <div className="panel-head">
          <h2>Try the exit resolver</h2>
          <span className="panel-note">live view call — no wallet needed</span>
        </div>
        <ExitResolver />
      </section>

      <section className="panel" id="activity">
        <div className="panel-head">
          <h2>Pool activity</h2>
          <span className="panel-note">real events from the contract, read via eth_getLogs</span>
        </div>
        <ActivityFeed />
      </section>

      <section className="panel" id="position">
        <div className="panel-head"><h2>Your position</h2></div>
        <WalletPanel />
      </section>

      <section className="panel" id="contracts">
        <div className="panel-head"><h2>Deployed contracts</h2><span className="panel-note">Monad testnet · 10143</span></div>
        <div className="addrs">
          {[
            ["StrataPool", POOL_ADDRESS],
            ["sCVA (CVA)", "0xa4C1B2d93D1F6A1cF83047C0C068ac15DEf7224f"],
            ["A-Pass (CVI)", "0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9"],
            ["Cleanverse Policy", "0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd"],
            ["dUSDC (asset)", "0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242"],
          ].map(([label, addr]) => (
            <a key={label} className="addr-row" href={EXPLORER_ADDR(addr)} target="_blank" rel="noreferrer">
              <span className="addr-label">{label}</span>
              <code>{addr}</code>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
