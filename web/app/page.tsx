import Link from "next/link";
import {CLEANVERSE, POOL_ADDRESS} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";
import {SmoothScroll} from "@/components/SmoothScroll";
import {ScrollReveal} from "@/components/ScrollReveal";
import {Parallax} from "@/components/Parallax";

const RATES = ["DIRECT", "ROUTED", "BLOCKED", "CVI", "CVA", "BASIS +225bps", "MONAD 10143", "VERIFIED 99.75", "OPEN 97.50"];

export default function Landing() {
  return (
    <div className="ef">
      <SmoothScroll />
      <ScrollReveal />
      <Parallax />

      <div className="ef-ticker" aria-hidden="true">
        <div className="ef-ticker-track">
          {Array.from({length: 3}).map((_, k) => (
            <span key={k} className="ef-ticker-set">
              {RATES.map((r, i) => <span key={i} className="ef-rate">{r}</span>)}
            </span>
          ))}
        </div>
      </div>

      <nav className="ef-nav">
        <span className="ef-logo">STRATA</span>
        <div className="ef-nav-links">
          <a href="#products">Products</a>
          <a href="#steps">How it works</a>
          <a href="#support">Who it serves</a>
          <a href="#chains">Deployed</a>
        </div>
        <div className="ef-nav-cta">
          <Link href="/dashboard" className="ef-btn-ghost">Launch app</Link>
          <Link href="/dashboard" className="ef-btn-dark">Open dashboard</Link>
        </div>
      </nav>

      <header className="ef-hero">
        <div className="ef-hero-l">
          <h1 className="ef-h1" data-sr="rise">Your Liquidity<br />Stays Compliant</h1>
          <p className="ef-sub" data-sr><span className="mark">An exit is graded, not refused.</span></p>
          <p className="ef-sub-body" data-sr>
            STRATA moves the compliance boundary from the pool to the position, so one balance and
            one price curve can serve many legal strata at once.
          </p>
          <div className="ef-hero-btns" data-sr>
            <Link href="/dashboard" className="ef-btn-dark lg">Open the dashboard &rarr;</Link>
            <a href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer" className="ef-btn-ghost lg">Read the code</a>
          </div>
        </div>
        <div className="ef-hero-r" aria-hidden="true">
          <div className="ef-artcard px" data-px data-px-speed="0.16">
            <div className="art-ticks">
              <div className="art-tick" style={{left: "29%"}}><span>97.50</span><i>OPEN</i></div>
              <div className="art-tick verified" style={{left: "79%"}}><span>99.75</span><i>VERIFIED</i></div>
            </div>
            <div className="art-bar">
              <div className="art-seg art-open" style={{flexGrow: 58}}>OPEN<b>58</b></div>
              <div className="art-seg art-verified" style={{flexGrow: 42}}>VERIFIED<b>42</b></div>
            </div>
            <div className="art-bracket-row"><div className="art-bracket" /><span className="art-basis">+225 bps</span></div>
            <div className="ef-artcard-cap">the compliance basis, priced on-chain</div>
          </div>
        </div>
      </header>

      <section className="ef-trust" data-sr>
        <span className="ef-trust-label">BUILT ON</span>
        <div className="ef-trust-row">
          <span>CLEANVERSE</span><span>CVI</span><span>CVA</span><span>POLICY</span><span>MONAD TESTNET</span>
        </div>
      </section>

      <section className="ef-products" id="products">
        <h2 className="ef-h2" data-sr="rise">Two outcomes for one request.</h2>
        <p className="ef-lead" data-sr>A withdrawal is no longer pass or revert. It is graded, and every grade is explicable.</p>
        <div className="ef-cards">
          <div className="ef-card px" data-px data-px-speed="0.09">
            <div className="ef-card-tag">RESOLVED</div>
            <h3>Routed</h3>
            <p>The redeemer clears a strict subset. Burn only the legally-redeemable portion; the rest defers with a reason code, recorded on-chain.</p>
            <ul>
              <li>Partial legal exit</li>
              <li>Reason recorded, not thrown</li>
              <li>No pool-level revert</li>
            </ul>
            <Link href="/dashboard" className="ef-card-cta dark">See it live &rarr;</Link>
          </div>
          <div className="ef-card lime px" data-px data-px-speed="-0.09">
            <div className="ef-card-tag">PRICED</div>
            <h3>The basis</h3>
            <p>Strata differ in legal transferability, so they differ in price. The gap between them is the first live on-chain price for what a transfer restriction costs.</p>
            <ul>
              <li>+225 bps on the deployed pool</li>
              <li>Widens on revocation</li>
              <li>Readable by anyone</li>
            </ul>
            <Link href="/dashboard" className="ef-card-cta">Open the ledger &rarr;</Link>
          </div>
        </div>
      </section>

      <section className="ef-steps" id="steps">
        <h2 className="ef-h2 light" data-sr="rise">A clear path to a compliant exit.</h2>
        <div className="ef-steps-grid">
          {[
            ["01", "Deposit", "Shares are stamped with the depositor credential at issuance."],
            ["02", "Hold", "One balance, one price curve, many legal strata."],
            ["03", "Withdraw", "The resolver grades the request: Direct, Routed or Blocked."],
            ["04", "Settle", "Only the legally-redeemable portion burns. The rest defers."],
          ].map(([n, t, d]) => (
            <div key={n} className="ef-step px" data-px data-px-speed={Number(n) % 2 ? "0.07" : "-0.07"}>
              <div className="ef-step-n">{n}</div>
              <div className="ef-step-rule"><span className="ef-step-node" /></div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <Link href="/dashboard" className="ef-btn-lime lg">Open the dashboard &rarr;</Link>
      </section>

      <section className="ef-support" id="support">
        <h2 className="ef-h2 light center" data-sr="rise">Who it serves</h2>
        <div className="ef-support-grid">
          <div className="ef-scard px" data-px data-px-speed="0.08">
            <div className="ef-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg>
            </div>
            <h3>RWA issuers</h3>
            <p>Secondary liquidity without breaking transfer restrictions. One deep pool instead of many thin ones.</p>
          </div>
          <div className="ef-scard px" data-px data-px-speed="-0.06">
            <div className="ef-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
            </div>
            <h3>Verified LPs</h3>
            <p>Yield on restricted assets, with access to the full pool priced for their credential tier.</p>
          </div>
          <div className="ef-scard px" data-px data-px-speed="0.08">
            <div className="ef-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
            </div>
            <h3>Compliance officers</h3>
            <p>Provable enforcement and an audit trail. Every exit carries a reason code, on-chain.</p>
          </div>
        </div>
      </section>

      <section className="ef-chains" id="chains">
        <h2 className="ef-h2 center" data-sr="rise">Deployed and registered on Monad testnet.</h2>
        <div className="ef-addr-list">
          {[["StrataPool", POOL_ADDRESS], ["aUSDC / CVA", CLEANVERSE.ausdc], ["A-Pass / CVI", CLEANVERSE.apass], ["Policy", CLEANVERSE.policy]].map(([l, a]) => (
            <a key={l} data-sr className="ef-addr" href={EXPLORER_ADDR(a as string)} target="_blank" rel="noreferrer">
              <span>{l}</span><code>{a || "\u2014"}</code>
            </a>
          ))}
        </div>
      </section>

      <footer className="ef-footer">
        <div className="ef-foot-word">STRATA</div>
        <div className="ef-foot-meta">
          <span>Cleanverse Build: Trusted Assets / DeFi track</span>
          <a href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">github.com/Venkat5599/strata</a>
        </div>
      </footer>
    </div>
  );
}
