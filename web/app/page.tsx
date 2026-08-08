import Link from "next/link";
import {CLEANVERSE, POOL_ADDRESS} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";
import {SmoothScroll} from "@/components/SmoothScroll";

const CHAPTERS = [
  {n: "01", title: "The problem", lede: "A pool socializes ownership. One unverified holder taints the whole book, so every compliant venue gates the entire pool, fragmenting $32B of tokenized assets into thin, per-jurisdiction silos."},
  {n: "02", title: "The finding", lede: "The live Cleanverse Policy contract reverts when a party holds no A-Pass. It does not return false. A revert treats 58% legally yours as identical to none of it. STRATA catches that and grades it."},
  {n: "03", title: "The resolver", lede: "A pure library decides how much of a withdrawal is legally redeemable, and why. Direct clears in full, Routed burns only the legal subset, Blocked defers with a reason. Four invariants, fifty thousand fuzz runs."},
  {n: "04", title: "The basis", lede: "Strata differ in legal transferability, so they differ in price. The gap between them is the compliance basis, the first live on-chain price for what a transfer restriction costs an issuer."},
  {n: "05", title: "Built on Cleanverse", lede: "CVI sets stratum membership from the on-chain credential. CVA is the registered instrument, referenced and custodied. The pool is registered as a Cleanverse compliance pool through the signed write path."},
];

export default function Landing() {
  return (
    <main className="lp">
      <SmoothScroll />

      <nav className="lp-nav">
        <span className="lp-word">STRATA</span>
        <div className="lp-nav-right">
          <span className="lp-tag">[ DEFI TRACK ]</span>
          <span className="lp-chain">monad testnet / live</span>
          <Link href="/dashboard" className="lp-cta-sm">Launch app</Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">[ COMPLIANCE-PARTITIONED LIQUIDITY ]</div>
          <h1 className="lp-h1">One pool.<br /><em>Many legal strata.</em></h1>
          <p className="lp-lead">
            Move the compliance boundary from the pool to the position. One balance, one price
            curve, many legal strata. An exit is graded, not refused.
          </p>
          <div className="lp-actions">
            <Link href="/dashboard" className="lp-cta">Open the dashboard</Link>
            <a className="lp-link" href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">
              Read the code
            </a>
          </div>
        </div>

        <div className="lp-hero-art" aria-hidden="true">
          <div className="art-ticks">
            <div className="art-tick" style={{left: "29%"}}><span>97.50</span><i>OPEN</i></div>
            <div className="art-tick verified" style={{left: "79%"}}><span>99.75</span><i>VERIFIED</i></div>
          </div>
          <div className="art-bar">
            <div className="art-seg art-open" style={{flexGrow: 58}}>OPEN<b>58</b></div>
            <div className="art-seg art-verified" style={{flexGrow: 42}}>VERIFIED<b>42</b></div>
          </div>
          <div className="art-bracket-row">
            <div className="art-bracket" />
            <span className="art-basis">+225 bps</span>
          </div>
          <div className="art-caption">the compliance basis, what a transfer restriction costs, priced on-chain</div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array.from({length: 2}).map((_, i) => (
            <span key={i}>
              COMPLIANCE-PARTITIONED LIQUIDITY <i>/</i> DIRECT <i>/</i> ROUTED <i>/</i> BLOCKED
              <i>/</i> CVI <i>/</i> CVA <i>/</i> MONAD TESTNET <i>/</i>{" "}
            </span>
          ))}
        </div>
      </div>

      <section className="lp-chapters">
        {CHAPTERS.map((c) => (
          <a key={c.n} href="#deployed" className="chapter">
            <span className="chapter-n">{c.n}</span>
            <div className="chapter-body">
              <h2 className="chapter-title">{c.title}</h2>
              <p className="chapter-lede">{c.lede}</p>
            </div>
            <span className="chapter-arrow" aria-hidden="true">&rarr;</span>
          </a>
        ))}
      </section>

      <section className="lp-branches-wrap">
        <div className="lp-eyebrow">[ HOW AN EXIT RESOLVES ]</div>
        <div className="lp-branches">
          <div className="lp-branch"><h3>Direct</h3><p>The redeemer clears every restriction. The whole position settles in one call.</p></div>
          <div className="lp-branch"><h3 className="b-routed">Routed</h3><p>A strict subset clears. Burn only the legally-redeemable portion; the rest defers with a reason code.</p></div>
          <div className="lp-branch"><h3 className="b-blocked">Blocked</h3><p>No legal path today. Nothing burns, the attempt is still recorded on-chain, the claim enters compliant liquidation.</p></div>
        </div>
      </section>

      <section className="lp-deployed" id="deployed">
        <div className="lp-eyebrow">[ DEPLOYED / MONAD TESTNET 10143 ]</div>
        <div className="lp-addr-list">
          {[["StrataPool", POOL_ADDRESS], ["aUSDC (CVA)", CLEANVERSE.ausdc], ["A-Pass (CVI)", CLEANVERSE.apass], ["Policy", CLEANVERSE.policy]].map(([l, a]) => (
            <a key={l} className="lp-addr" href={EXPLORER_ADDR(a as string)} target="_blank" rel="noreferrer">
              <span>{l}</span><code>{a || "\u2014"}</code>
            </a>
          ))}
        </div>
        <Link href="/dashboard" className="lp-cta lp-cta-wide">Open the dashboard</Link>
      </section>

      <footer className="lp-footer">
        <span className="lp-word lp-word-lg">STRATA</span>
        <div className="lp-foot-meta">
          <span>Cleanverse Build: Trusted Assets / DeFi track</span>
          <a href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">github.com/Venkat5599/strata</a>
        </div>
      </footer>
    </main>
  );
}
