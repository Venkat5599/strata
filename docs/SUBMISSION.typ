#set page(paper: "a4", margin: (x: 1.6cm, y: 1.4cm), footer: none)
#set text(size: 9pt, font: ("Liberation Sans", "Helvetica", "Arial"))
#set par(justify: false, leading: 0.55em)

#text(size: 15pt, weight: "bold")[STRATA — one-page summary]
#v(0.15em)
#text(size: 8.5pt, fill: rgb("#666666"))[Cleanverse Build: Trusted Assets Hackathon · DeFi track · Monad testnet · repo: #link("https://github.com/Venkat5599/strata")[github.com/Venkat5599/strata] · live: #link("https://strata-monad-nine.vercel.app")[strata-monad-nine.vercel.app]]
#v(0.4em)
#line(length: 100%, stroke: 0.6pt)

#set heading(numbering: none)
#show heading: it => block(above: 0.55em, below: 0.25em, text(size: 10.5pt, weight: "bold", fill: rgb("#111111"), it.body))

= Problem
A compliance pool socializes ownership, so one non-compliant LP taints the whole pool — and the industry answer gates the pool in aggregate, so every LP pays the strictest restriction. Worse, Cleanverse's own `canTransfer` primitive answers non-compliance with a #text(weight: "bold")[hard revert]: an LP who legally owns 58% of a position can withdraw none of it.

= Solution
STRATA moves the compliance boundary from the #text(weight: "bold")[pool] to the #text(weight: "bold")[position]: one balance, one price curve, N legal strata (OPEN / VERIFIED), and a withdrawal resolver that #text(weight: "bold")[grades instead of reverting] — returning `Direct`, `Routed`, or `Blocked` with the burnable/deferred split and the on-chain reason. Compliance partitions by credential; positions re-attribute when credentials change; the blocked branch prices at zero — so the #text(weight: "bold")[compliance basis] (`basis(a,b) = price(a) − price(b)`) becomes the first on-chain price of a transfer restriction.

- `previewExit(address, shares)` — pure view; grades any request, no wallet
- `deposit` / `depositAToken` — shares stamped with the depositor's credential
- `linkCredential` — migrates anonymous lots to the credential on upgrade
- `syncStratum` — permissionless mirror of the Policy pause state
- Four resolver invariants (conservation, no over-release, revocation absolute, freeze dominates) fuzzed at 10,000 runs; 48 tests green (33 local + 15 fork against the live Cleanverse contracts)

= CVI · CVA integration points
#table(
  columns: (1.9fr, 2.6fr, 2.6fr),
  inset: 4pt,
  stroke: (x: 0.4pt, y: 0.4pt),
  align: (left, left, left),
  [#text(weight: "bold", size: 8.5pt)[Primitive]], [#text(weight: "bold", size: 8.5pt)[Role in STRATA]], [#text(weight: "bold", size: 8.5pt)[Live state]],
  [`CVI · A-Pass` `0xbA82D189…`], [`credentialOf()` reads the on-chain ERC-721 credential; positions key on the credential, never on `msg.sender`], [Pool holds its own A-Pass (`balanceOf(pool) == 1`, cvRecord 2089); verified LP tier 50],
  [`CVA · A-Token`], [the registered instrument every policy question is denominated in; constructor rejects unregistered tokens], [`isTokenRegistered(sCVA) == true`],
  [`Policy` `0x36489bE4…`], [`policyClears()` wraps `canTransfer` (revert → `false`); `isPaused` drives the Blocked branch], [aUSDC registered, policy unpaused — chips verified live on the dashboard],
  [`CVA · custodied`], [`depositAToken()` takes a registered A-Token directly], [#text(fill: rgb("#1a7f37"))[Live: pool custodies 250,000 sCVA — our own CVA, minted by us, real `depositAToken` (tx `0x7b489ad6`)]],
  [`Validator`], [registered via `POST /validator/register` with an EIP-191 owner signature], [`is_register: true`, rules `min_tier: 1`, tx `0x983586fd`],
  [`CCP export`], [`/api/ccp/export` — downloadable audit record of pool state + live credential], [server route; API key never reaches the browser],
)

= Deployed
#text(weight: "bold")[Chain:] Monad testnet (10143) · RPC `https://testnet-rpc.monad.xyz`

#table(
  columns: (1.9fr, 3.5fr, 2.7fr),
  inset: 4pt,
  stroke: (x: 0.4pt, y: 0.4pt),
  align: (left, left, left),
  [#text(weight: "bold", size: 8.5pt)[Contract]], [#text(weight: "bold", size: 8.5pt)[Address]], [#text(weight: "bold", size: 8.5pt)[State]],
  [StrataPool], [`0x04df73761E1e524C0112D9a3633A44F8924BC31D`], [registered validator; OPEN 150,000 / VERIFIED 255,000],
  [sCVA (our CVA)], [`0xa4C1B2d93D1F6A1cF83047C0C068ac15DEf7224f`], [Policy-registered; 250,000 custodied],
  [A-Pass (CVI)], [`0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9`], [pool + verified LP hold credentials],
  [Cleanverse Policy], [`0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd`], [aUSDC registered, unpaused],
  [dUSDC (asset)], [`0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242`], [open-mint demo dollar],
)

#v(0.3em)
App: #link("https://strata-monad-nine.vercel.app")[strata-monad-nine.vercel.app] (landing + section-based dashboard; every number a live contract read).

#v(0.3em)
#line(length: 100%, stroke: 0.4pt)
#text(size: 8pt, fill: rgb("#666666"))[Honest notes: testnet USDC has no open mint and the USDC→aUSDC conversion is blocked upstream, so the OPEN stratum pools dUSDC and the custodied CVA is our own sCVA — both per Cleanverse's sanctioned guidance ("issuing your own CVA is permitted"). The pool architecture is unchanged for USDC-backed custody the moment their conversion pipeline works.]
