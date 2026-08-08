import Link from "next/link";
import {CLEANVERSE, POOL_ADDRESS} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";

export default function Landing() {
  return (
    <main className="lp">
      <nav className="lp-nav">
        <span className="lp-word">STRATA</span>
        <div className="lp-nav-right">
          <span className="lp-chain">monad testnet · live</span>
          <Link href="/dashboard" className="lp-cta-sm">Launch app ↗</Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">One pool.<br /><em>Many legal strata.</em></h1>
          <p className="lp-lead">
            A liquidity pool socializes ownership, so one unverified holder taints the whole book.
            The usual answer is to gate the pool, which fragments $32B of tokenized assets into thin
            silos. STRATA moves the boundary onto the position: an exit is graded, not refused.
          </p>
          <div className="lp-actions">
            <Link href="/dashboard" className="lp-cta">Open the dashboard</Link>
            <a className="lp-link" href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">
              Read the code ↗
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
          <div className="art-caption">the compliance basis — what a transfer restriction costs, priced on-chain</div>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-finding">
          <div className="lp-kicker">THE FINDING THIS RESTS ON</div>
          <p className="lp-finding-body">
            The live Cleanverse Policy contract <b>reverts</b> when a party holds no A-Pass — it does not
            return <code>false</code>. A revert treats <em>&ldquo;58% of this is legally yours&rdquo;</em> as identical
            to <em>&ldquo;none of it is.&rdquo;</em> STRATA catches that revert and grades the result.
          </p>
        </div>
      </section>

      <section className="lp-how">
        <div className="lp-kicker">HOW AN EXIT RESOLVES</div>
        <div className="lp-branches">
          <div className="lp-branch"><h3>Direct</h3><p>The redeemer clears every restriction on the shares requested. The whole position settles in one call.</p></div>
          <div className="lp-branch"><h3 className="b-routed">Routed</h3><p>A strict subset clears. Burn only the legally-redeemable portion; the rest defers with a reason code. The invention.</p></div>
          <div className="lp-branch"><h3 className="b-blocked">Blocked</h3><p>No legal path today. Nothing burns, the attempt is still recorded on-chain, and the claim enters compliant liquidation.</p></div>
        </div>
      </section>

      <section className="lp-integ">
        <div className="lp-kicker">BUILT ON CLEANVERSE</div>
        <div className="lp-integ-grid">
          <div className="lp-int"><h4>CVI · A-Pass</h4><p>On-chain credential drives stratum membership. Positions key on the credential, never the wallet.</p></div>
          <div className="lp-int"><h4>CVA · A-Token</h4><p>aUSDC is the instrument every policy question is denominated in, and is custodied directly.</p></div>
          <div className="lp-int"><h4>Policy</h4><p>Read synchronously on every exit; its revert becomes a graded outcome.</p></div>
          <div className="lp-int"><h4>Validator</h4><p>The pool is registered as a Cleanverse compliance pool through the signed write path.</p></div>
        </div>
      </section>

      <section className="lp-deployed">
        <div className="lp-kicker">DEPLOYED · MONAD TESTNET 10143</div>
        <div className="lp-addr-list">
          {[["StrataPool", POOL_ADDRESS], ["aUSDC (CVA)", CLEANVERSE.ausdc], ["A-Pass (CVI)", CLEANVERSE.apass], ["Policy", CLEANVERSE.policy]].map(([l, a]) => (
            <a key={l} className="lp-addr" href={EXPLORER_ADDR(a as string)} target="_blank" rel="noreferrer">
              <span>{l}</span><code>{a || "—"}</code>
            </a>
          ))}
        </div>
        <Link href="/dashboard" className="lp-cta lp-cta-wide">Open the dashboard →</Link>
      </section>

      <footer className="lp-footer">
        <span className="lp-word lp-word-lg">STRATA</span>
        <div className="lp-foot-meta">
          <span>Cleanverse Build: Trusted Assets · DeFi track</span>
          <a href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">github.com/Venkat5599/strata</a>
        </div>
      </footer>
    </main>
  );
}
