import Link from "next/link";
import {CLEANVERSE, POOL_ADDRESS} from "@/lib/strata";
import {EXPLORER_ADDR} from "@/lib/contracts";
import {SmoothScroll} from "@/components/SmoothScroll";

type Finding = {
  n: string;
  title: string[];
  stat: string;
  statLabel: string;
  body: string;
  quote: string;
  figure?: boolean;
};

const FINDINGS: Finding[] = [
  {
    n: "01",
    title: ["The", "problem"],
    stat: "$32B",
    statLabel: "fragmented into per-jurisdiction silos",
    body: "A pool socializes ownership. One unverified holder taints the whole book, so every compliant venue gates the entire pool. The cost is conceded inside the ERC-3643 literature itself: restricting to verified entities narrows the participant pool, and the liquidity tradeoff is real.",
    quote: "Three separate pools, three price curves, for one identical underlying asset.",
  },
  {
    n: "02",
    title: ["The", "finding"],
    stat: "reverts",
    statLabel: "it does not return false",
    body: "Probing the live Cleanverse Policy contract showed canTransfer reverts when a party holds no A-Pass. A revert is a legally coarse answer. STRATA catches that revert and grades the result, converting a hard failure into a graded, explicable outcome.",
    quote: "It treats 58% of this is legally yours as identical to none of it is.",
  },
  {
    n: "03",
    title: ["The", "resolver"],
    stat: "50,000",
    statLabel: "fuzz runs, four invariants, zero failures",
    body: "A pure library decides how much of a withdrawal is legally redeemable, and why. Direct clears in full, Routed burns only the legal subset, Blocked defers with a reason code. The correctness argument is property-based, not a handful of chosen examples.",
    quote: "If the resolver is wrong, every other part of the project is decoration.",
  },
  {
    n: "04",
    title: ["The", "basis"],
    stat: "+225 bps",
    statLabel: "the price of a transfer restriction, on-chain",
    body: "Strata differ in legal transferability, so they differ in price. The gap between them is the compliance basis, the first live on-chain price for what a transfer restriction costs an issuer. It reads on the deployed pool today, and widens on revocation.",
    quote: "Issuers cannot currently measure what their transfer restrictions cost in basis points.",
    figure: true,
  },
  {
    n: "05",
    title: ["Built on", "Cleanverse"],
    stat: "CVI + CVA",
    statLabel: "read and custodied, proven against live contracts",
    body: "CVI sets stratum membership from the on-chain credential; positions key on the credential, never the wallet. CVA is the registered instrument every policy question is denominated in, and is custodied directly. The pool is a registered Cleanverse compliance pool.",
    quote: "Remove any one and STRATA is just a whitelist.",
  },
  {
    n: "06",
    title: ["The", "record"],
    stat: "47 / 0",
    statLabel: "tests passing, failures, source verified",
    body: "Eleven resolver fuzz suites, twelve pool integration tests, nine audit regressions, fifteen fork tests against the real Cleanverse contracts. Four security findings, all fixed, each with a regression test that fails against the pre-fix contract. Source verified on Sourcify.",
    quote: "The mandatory browser-wallet transaction is proven on-chain: status 1.",
  },
];

export default function Landing() {
  return (
    <main className="rp">
      <SmoothScroll />

      <nav className="rp-nav">
        <span className="rp-word">STRATA</span>
        <div className="rp-nav-right">
          <span className="rp-tag">[ DEFI TRACK ]</span>
          <span className="rp-tag">[ MONAD TESTNET ]</span>
          <Link href="/dashboard" className="rp-launch">[ LAUNCH APP ]</Link>
        </div>
      </nav>

      <header className="rp-hero">
        <div className="rp-hero-eyebrow">[ COMPLIANCE-PARTITIONED LIQUIDITY / 2026 ]</div>
        <h1 className="rp-stack">
          <span className="rp-line">ONE POOL</span>
          <span className="rp-line">ONE CURVE</span>
          <span className="rp-line rp-dbl">
            <span className="rp-fill">MANY STRATA</span>
            <span className="rp-out">MANY STRATA</span>
          </span>
        </h1>
        <div className="rp-hero-foot">
          <p className="rp-hero-lead">An exit is graded, not refused.</p>
          <Link href="/dashboard" className="rp-cta">Open the dashboard</Link>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array.from({length: 2}).map((_, i) => (
            <span key={i}>
              DIRECT <i>/</i> ROUTED <i>/</i> BLOCKED <i>/</i> CVI <i>/</i> CVA <i>/</i>
              COMPLIANCE BASIS <i>/</i> MONAD TESTNET <i>/</i>{" "}
            </span>
          ))}
        </div>
      </div>

      <section className="rp-intro">
        <div className="rp-kicker">[ INTRODUCTION ]</div>
        <p className="rp-intro-body">
          STRATA moves the compliance boundary from the pool to the position. Deposits mint shares
          stamped with the depositor credential. One asset balance, one price curve, many legal
          strata. Withdrawal runs through a pure resolver that returns Direct, Routed or Blocked
          instead of reverting. Built on Cleanverse CVI and CVA, deployed and registered on Monad
          testnet.
        </p>
      </section>

      <section className="rp-findings">
        <div className="rp-kicker rp-findings-head">
          [ KEY FINDINGS ] &mdash; the argument, in six parts
        </div>

        {FINDINGS.map((f) => (
          <article key={f.n} className="finding" id={`kf-${f.n}`}>
            <div className="finding-index">[ {f.n} ]</div>
            <h2 className="finding-title">
              {f.title.map((t, i) => (
                <span key={i} className="finding-word">{t}</span>
              ))}
            </h2>
            <div className="finding-stat">{f.stat}</div>
            <div className="finding-statlabel">{f.statLabel}</div>

            {f.figure && (
              <div className="finding-figure" aria-hidden="true">
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
              </div>
            )}

            <p className="finding-body">{f.body}</p>
            <blockquote className="finding-quote">{f.quote}</blockquote>
          </article>
        ))}
      </section>

      <section className="rp-deployed" id="deployed">
        <div className="rp-kicker">[ DEPLOYED / MONAD TESTNET 10143 ]</div>
        <div className="rp-addr-list">
          {[["StrataPool", POOL_ADDRESS], ["aUSDC / CVA", CLEANVERSE.ausdc], ["A-Pass / CVI", CLEANVERSE.apass], ["Policy", CLEANVERSE.policy]].map(([l, a]) => (
            <a key={l} className="rp-addr" href={EXPLORER_ADDR(a as string)} target="_blank" rel="noreferrer">
              <span>{l}</span><code>{a || "\u2014"}</code>
            </a>
          ))}
        </div>
        <Link href="/dashboard" className="rp-cta rp-cta-wide">Open the dashboard</Link>
      </section>

      <footer className="rp-footer">
        <div className="rp-foot-word">
          <span className="rp-fill">STRATA</span>
          <span className="rp-out">STRATA</span>
        </div>
        <div className="rp-foot-meta">
          <span>[ CLEANVERSE BUILD: TRUSTED ASSETS ]</span>
          <a href="https://github.com/Venkat5599/strata" target="_blank" rel="noreferrer">github.com/Venkat5599/strata</a>
        </div>
      </footer>
    </main>
  );
}
