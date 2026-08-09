# STRATA

**Compliance-partitioned liquidity. One pool, one price curve, multiple legal strata.**

Built for the Cleanverse Build: Trusted Assets Hackathon — DeFi track, Monad testnet.

---

## Live

- **App:** https://strata-monad-nine.vercel.app  (landing + `/dashboard`, live demo pool)
- **Contract source:** verified on Sourcify — https://repo.sourcify.dev/contracts/full_match/10143/0xa7c457dd7add8e57317ba2b43ea4817f07192dea/
- **Mandatory wallet transaction, proven live:** `syncStratum(1)` tx `0x92bdf770c08c14c2d74b984cd56311f83ce9c312435585dee79b745566359471` (status 1). This is the exact call the dashboard's "Sync compliance state" button signs from a browser-extension wallet.


## The problem

A liquidity pool socializes ownership: one asset balance, many claimants. If a single LP is unverified, sanctioned, or in the wrong jurisdiction, the pool's holdings are non-compliant **in aggregate**.

The industry's answer is to gate the whole pool. Uniswap v4 shipped Permissioned Pools doing exactly this. The cost is conceded inside the ERC-3643 literature itself: restricting to verified entities "narrows the participant pool," and the "liquidity tradeoff is real." The result is over $32B of tokenized assets sitting in thin, fragmented, per-investor-class silos — a tokenized T-bill fund with US-accredited, EU-professional and Singapore-AI investor classes must run three separate pools, with three price curves, for one identical underlying asset.

## The solution

Move the compliance boundary from the **pool** to the **position**.

Deposits mint shares stamped with the depositor's credential. One asset balance, one price curve, N strata. Withdrawal runs through a pure resolver returning one of three outcomes:

- **`Direct`** — the redeemer clears every restriction on the shares requested
- **`Routed`** — the redeemer clears a strict subset; burn only the legally-redeemable portion
- **`Blocked`** — no legal path today; the claim defers, and the attempt is still recorded on-chain with a reason code

Because strata differ in legal transferability, they differ in price. That gap — the **compliance basis** — is the first live on-chain price for what a transfer restriction costs an issuer.

### The finding this design is built on

Probing the live Cleanverse Policy contract on Monad testnet showed that:

```solidity
Policy.canTransfer(token, from, to, amount)
```

**reverts** when a party holds no A-Pass. It does not return `false`.

A revert is a legally coarse answer: it treats *"58% of this is legally yours"* as identical to *"none of it is"*. STRATA wraps that call in `try/catch` and grades the result instead. Cleanverse's own primitive answers non-compliance with a hard failure; STRATA converts it into a graded, explicable outcome. That is the whole contribution, and it is demonstrated against their deployed contract rather than argued on a slide.

---

## Deployed — Monad testnet (chainId 10143)

| Contract | Address |
|---|---|
| **StrataPool** | `0xa7c457dd7add8e57317ba2b43ea4817f07192dea` |
| Owner | `0x483C8C23B2D518a8708c8FabDaF1AE68D7Bed389` |
| Pooled asset — USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Reference **and custodied** — aUSDC (CVA) | `0xaC0893567D43C3E7e6e35a72803df05416C1f20D` |
| A-Pass (CVI) | `0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9` |
| Cleanverse Policy | `0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd` |
| Cleanverse Validator | `0xaC7e5179C2C7f03f209136886c172eb34F161792` |

**Registered as a Cleanverse Validator compliance pool** — `POST /validator/is_register` returns `registered: true`, and `POST /validator/rules` echoes the `min_tier: 1` rule the contract actually enforces.

Call it yourself:

```bash
cast call 0xa7c457dd7add8e57317ba2b43ea4817f07192dea "basis(uint8,uint8)(int256)" 1 0 \
  --rpc-url https://testnet-rpc.monad.xyz
# 225  -> VERIFIED trades 225 bps above OPEN

cast call 0xa7c457dd7add8e57317ba2b43ea4817f07192dea "policyClears(address)(bool)" \
  0x483C8C23B2D518a8708c8FabDaF1AE68D7Bed389 --rpc-url https://testnet-rpc.monad.xyz
# true
```

---

## How CVI and CVA are integrated

Not adjacent to the protocol — the protocol reads them synchronously, on-chain, on every exit.

| Capability | Where it lands | Proof |
|---|---|---|
| **CVI (A-Pass)** | `credentialOf()` reads the on-chain ERC-721 credential and derives `cviRef`. Positions key on the **credential**, never on `msg.sender` — an address is not a legal person, a credential is, so a fresh wallet inherits nothing. | A-Pass minted via `POST /generate_apass` (tier 50, tx `0x80db3087…`), then confirmed on-chain: `balanceOf(deployer) == 1` |
| **CVI (Policy)** | `policyClears()` calls `Policy.canTransfer` and maps its revert to `false`. `isFrozen()` supplies the revocation signal driving the `Blocked` branch. | Fork tests assert both the revert and the success path against the live contract |
| **CVA (A-Token) — referenced** | aUSDC is the registered instrument every policy question is denominated in. Cleanverse rules bind to a registered A-Token — `canTransfer` reverts `TokenNotRegistered` for anything else. Checked at construction. | `isTokenRegistered(aUSDC) == true`; the constructor rejects plain USDC |
| **CVA (A-Token) — custodied** | `depositAToken()` takes aUSDC directly. The pool **holds real aUSDC**, and lots record their backing so an A-Token claim settles back in the A-Token rather than a plain-token substitute. | Fork tests deposit and redeem aUSDC against the live deployment |
| **CVI — pool credential** | The pool holds **its own A-Pass**, minted through the same `/generate_apass` path a user takes. Without one, no contract can receive an A-Token at all. | `A-Pass.balanceOf(pool) == 1`, tx `0xfea66697...` |
| **CCP** | `/api/ccp/export` produces a downloadable audit record combining pool state with the live credential record. | Server route; api-key never reaches the browser |
| **Validator** | The pool is registered through the **write** path with an EIP-191 owner signature verified against the on-chain `owner()`. | `register` tx `0xfba1314b…`, `is_register: true` |

### Why the pool takes both USDC and aUSDC

A fork test caught a design error worth stating plainly, because it is the kind of thing mocks cannot find.

The pool originally custodied **only** aUSDC. Against the real contracts, an A-Token turned out to enforce compliance on every transfer and refuse both parties without an A-Pass. Two consequences followed, the second fatal:

1. the pool contract itself could not receive aUSDC
2. an uncredentialled LP could not hold aUSDC **at all**

If an unverified party cannot acquire the pooled asset, they never reach the resolver, and a position-level design silently collapses back into the pool-level gate it exists to replace.

So the pool takes **plain USDC**, which anyone may hold. That is what keeps the OPEN stratum reachable and the central demo beat alive.

It also takes **aUSDC directly**, through `depositAToken()`, and that path needs no wrapping gateway. AccessCore gates wrapping behind a deposit membership only Cleanverse can grant - `isDepositMember` returns false for us and `owner()` is theirs - and the institution faucet is empty for `usdc`, `ausdc` and `usdt` alike. Neither mattered: **anyone holding aUSDC is already credentialled by construction**, so they can simply deposit it. The only thing blocking that was the pool itself, since a contract without a credential cannot receive an A-Token. The pool was therefore given its own A-Pass, through the same CVI path a user takes.

The result is that compliance sits on the **claim**, while the instrument a claim is denominated in is recorded per lot. What a claim is worth legally and what it is denominated in are separate facts, and the contract keeps them separate.

---

## Tests

```bash
forge test                                   # 32 local tests
RUN_FORK=1 STRATA_POOL=0xa7c457dd7add8e57317ba2b43ea4817f07192dea \
  forge test --match-contract Fork           # 15 tests against live Cleanverse contracts
```

**48 tests, 0 failures.**

| Suite | Count | What it proves |
|---|---|---|
| `StrataResolver.t.sol` | 11 | The four invariants at 10 000 fuzz runs each |
| `StrataPool.t.sol` | 13 | Deposit, graded exit, revocation, pricing, stratum-total invariant |
| `StrataPoolAudit.t.sol` | 9 | One regression per audit finding, plus a solvency invariant |
| `StrataPool.fork.t.sol` | 15 | The same behaviour against the **real** Policy, A-Pass and tokens, including live aUSDC custody |

The resolver invariants are the correctness argument:

```
I1  burnable + deferred == requested                   conservation
I2  burnable <= sum(shares of positions that clear)    no over-release
I3  a blocked stratum contributes nothing              revocation is absolute
I4  frozen redeemer implies Blocked                    freeze dominates
```

Plus, over arbitrary deposit and exit flows: **shares outstanding never exceed assets held.**

---

## Security audit

Audited against the accounting-desync, access-control, incomplete-path, off-by-one, reentrancy and vault-invariant classes. Four findings, all fixed, each with a regression test that fails against the pre-fix contract.

| # | Severity | Finding |
|---|---|---|
| **F1** | HIGH | `syncStratum` took an arbitrary probe address and blocked a stratum whenever that probe was frozen — **anyone could halt every redemption from a stratum and drive `price()` to zero** by naming any frozen address. It also conflated one holder's status with a stratum's legal state. Now reads only asset-level `isPaused`; blocking on revocation moved behind `onlyOwner`. |
| **F2** | HIGH | Entitlement came from credential-keyed lots while settlement burned the caller's ERC-20 balance. An A-Pass is an ERC-721 and can move, so a party acquiring another's credential resolved against lots they could not burn. Now checked up front with a named error. |
| **F3** | MEDIUM | `deferredShares` accumulated instead of reporting the outstanding amount — two attempts against one 42-share position reported 84 deferred, and nothing decremented it. A compliance officer would read a liability that does not exist. |
| **F4** | MEDIUM | `previewExit` disagreed with `withdraw` after late verification, so the interface showed `BLOCKED` while the chain returned `ROUTED`. The demo would have displayed a figure the contract disagreed with. |

Bugs found earlier by the test suite rather than by review, all fixed: orphaned positions on verification (silent fund loss), `uint256`→`uint128` truncation in `deposit`, a `Routed` exit that could not explain itself, and the pool passing itself as its own compliance counterparty.

---

## Frontend

```bash
cd web && npm install && npm run dev
```

One route, one component that matters: the **stratum ledger**. A horizontal bar is the pooled
balance, segmented by stratum; a price tick sits above each segment; the bracket between them
is the compliance basis. Every number is a live contract read — stratum shares come from the
`stratumTotalShares` counter (sum == totalSupply, invariant-tested), prices from `price()`,
the split from `basis()`. The wallet panel signs real transactions: deposit (USDC or aUSDC
with an A-Pass), withdraw with a live `previewExit` plan, credential linking, and compliance
sync. There is no simulation and no mock data in the frontend.

Server routes keep `CLEANVERSE_API_KEY` out of the browser bundle, which is the concrete
reason this is a Next server app rather than a static page. The two Cleanverse-proxying
routes are rate-limited per IP, and `/api/health` proves configuration before any wallet
connects.

---

## Honest limitations

- **Partial exit has no legal precedent.** Splitting a redemption by the legal status of each lot is a proposal, not settled practice.
- **Discount factors are governance-set.** The contribution is exposing the spread as a first-class on-chain value, not discovering its market-clearing level. Market-discovered pricing is the post-hackathon matching market.
- **Shares are non-transferable.** A transferable share would let a blocked holder sell the claim to a clean wallet and exit through it. Secondary transfer of stratified claims needs its own compliance path.
- **Live deposits need testnet balances.** The Cleanverse institution faucet returned `transfer amount exceeds balance` for `usdc`, `ausdc` and `usdt` at the time of writing - its wallet is empty. The deposit and withdraw paths, aUSDC custody included, are therefore proven by the fork suite against the live deployment with synthesized balances.
- **AccessCore wrapping is out of reach.** Converting USDC into aUSDC through AccessCore needs a deposit membership only Cleanverse can grant (`isDepositMember` false; `owner()` is theirs). STRATA does not need it, because verified parties deposit aUSDC they already hold, but a production deployment offering wrapping in-flow would request it.
- **A-Pass tier granularity is not fully mapped.** `getTokenId(address)` is confirmed; the per-tokenId tier getter did not match ~35 candidate signatures in the implementation bytecode. `canTransfer` already encapsulates the tier check on-chain, and `POST /query_apass` supplies the tier off-chain, so nothing depends on the gap.
- **Single owner.** A production deployment wants a threshold signer set rather than one EOA.

---

## Layout

```
contracts/                       Solidity sources
  StrataResolver.sol             pure library - the contribution
  StrataPool.sol                 Ownable, ERC-20 shares, position-scoped compliance
  interfaces/                    Cleanverse ABIs, hand-written from live bytecode
test/                            resolver fuzz, pool, audit regressions, fork
deploy/Deploy.s.sol              Monad testnet deployment
tools/cleanverse.mjs             cooperate API client (AES-CBC + plain JSON)
tools/mint-apass.mjs             mint a CVI credential
tools/register-validator.mjs     register the pool with Cleanverse
frontend/                        Next.js stratum ledger
docs/                            PRD, architecture, submission summary
```

## Post-hackathon

- Configurable stratum schemas so issuers define their own jurisdiction and investor-class partitions
- Publish the compliance basis as a public feed — issuers currently cannot measure what their transfer restrictions cost in basis points
- The compliance-basis matching market: a party who legally *can* hold a blocked position bids on it at a discount, turning compliance friction into yield
- Explore alignment with ERC-7943 (uRWA) as a neutral interface
