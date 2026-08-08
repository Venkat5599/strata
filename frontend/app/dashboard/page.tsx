"use client";

import {useMemo} from "react";
import {useReadContract} from "wagmi";
import {StratumLedger} from "@/components/StratumLedger";
import {LiveStats} from "@/components/LiveStats";
import {WalletPanel} from "@/components/WalletPanel";
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

      <LiveStats />

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
              The pool currently holds no liquidity. Connect a wallet and deposit USDC or
              aUSDC (with an A-Pass) to see the ledger populate from the contract.
            </p>
          </div>
        )}
      </section>

      <section className="panel" id="position">
        <div className="panel-head"><h2>Your position</h2></div>
        <WalletPanel />
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
          {[["StrataPool", POOL_ADDRESS]].map(([label, addr]) => (
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
