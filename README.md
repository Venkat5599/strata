# STRATA

**Compliance-partitioned liquidity. One pool, one price curve, multiple legal strata.**

Built for the Cleanverse Build: Trusted Assets Hackathon — DeFi track, Monad testnet.

---

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
| **StrataPool** | `0xe747e5adbde5363564e7b2d2c2c3199fae46a64e` |
| Owner | `0x28b53f72f7a87a67A57c05fFb76d5D52D1d88dF0` |
| Pooled asset — USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Compliance reference — aUSDC (CVA) | `0xaC0893567D43C3E7e6e35a72803df05416C1f20D` |
| A-Pass (CVI) | `0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9` |
| Cleanverse Policy | `0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd` |
| Cleanverse Validator | `0xaC7e5179C2C7f03f209136886c172eb34F161792` |

**Registered as a Cleanverse Validator compliance pool** — `POST /validator/is_register` returns `registered: true`, and `POST /validator/rules` echoes the `min_tier: 1` rule the contract actually enforces.

Call it yourself:

```bash
cast call 0xe747e5adbde5363564e7b2d2c2c3199fae46a64e "basis(uint8,uint8)(int256)" 1 0 \
  --rpc-url https://testnet-rpc.monad.xyz
# 225  -> VERIFIED trades 225 bps above OPEN

cast call 0xe747e5adbde5363564e7b2d2c2c3199fae46a64e "policyClears(address)(bool)" \
  0x28b53f72f7a87a67A57c05fFb76d5D52D1d88dF0 --rpc-url https://testnet-rpc.monad.xyz
# true
```

---

## How CVI and CVA are integrated

Not adjacent to the protocol — the protocol reads them synchronously, on-chain, on every exit.

| Capability | Where it lands | Proof |
|---|---|---|
| **CVI (A-Pass)** | `credentialOf()` reads the on-chain ERC-721 credential and derives `cviRef`. Positions key on the **credential**, never on `msg.sender` — an address is not a legal person, a credential is, so a fresh wallet inherits nothing. | A-Pass minted via `POST /generate_apass` (tier 50, tx `0x80db3087…`), then confirmed on-chain: `balanceOf(deployer) == 1` |
| **CVI (Policy)** | `policyClears()` calls `Policy.canTransfer` and maps its revert to `false`. `isFrozen()` supplies the revocation signal driving the `Blocked` branch. | Fork tests assert both the revert and the success path against the live contract |
| **CVA (A-Token)** | aUSDC is the registered instrument every policy question is denominated in. Cleanverse rules bind to a registered A-Token — `canTransfer` reverts `TokenNotRegistered` for anything else. Checked at construction, so a misconfigured deploy fails immediately rather than at the first withdrawal. | `isTokenRegistered(aUSDC) == true`, and the constructor rejects plain USDC as a reference |
| **CCP** | `/api/ccp/export` produces a downloadable audit record combining pool state with the live credential record. | Server route; api-key never reaches the browser |
| **Validator** | The pool is registered through the **write** path with an EIP-191 owner signature verified against the on-chain `owner()`. | `register` tx `0xfba1314b…`, `is_register: true` |

### Why the pool holds USDC and not aUSDC

This was a design error caught by a fork test, and it is worth stating plainly because it is the kind of thing mocks cannot find.

The pool originally custodied aUSDC. Running against the real contracts showed that **an A-Token enforces compliance on every transfer and refuses both parties without an A-Pass**. Two consequences followed, the second fatal:

1. the pool contract itself could not receive aUSDC
2. an uncredentialled LP could not hold aUSDC **at all**

If an unverified party cannot acquire the pooled asset, they never reach the resolver, and a position-level design silently collapses back into the pool-level gate it exists to replace. The demo's central beat was unreachable.

The pool now custodies plain USDC — freely holdable by anyone — and keeps aUSDC as the reference instrument for policy queries. Compliance moves onto the **claim** rather than the token, which is what the thesis said all along.

---

## Tests

```bash
forge test                                   # 32 local tests
RUN_FORK=1 forge test --match-contract Fork  # 11 tests against live Cleanverse contracts
```

**43 tests, 0 failures.**

| Suite | Count | What it proves |
|---|---|---|
| `StrataResolver.t.sol` | 11 | The four invariants at 10 000 fuzz runs each |
| `StrataPool.t.sol` | 12 | Deposit, graded exit, revocation, pricing |
| `StrataPoolAudit.t.sol` | 9 | One regression per audit finding, plus a solvency invariant |
| `StrataPool.fork.t.sol` | 11 | The same behaviour against the **real** Policy, A-Pass and tokens |

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

One route, one component that matters: the **stratum ledger**. A horizontal bar is the pooled balance, segmented by stratum; a price tick sits above each segment; the bracket between them is the compliance basis. Demo beats are deep-linkable — `/?beat=2` lands directly on the routed exit.

Server routes keep `CLEANVERSE_API_KEY` out of the browser bundle, which is the concrete reason this is a Next server app rather than a static page.

---

## Honest limitations

- **Partial exit has no legal precedent.** Splitting a redemption by the legal status of each lot is a proposal, not settled practice.
- **Discount factors are governance-set.** The contribution is exposing the spread as a first-class on-chain value, not discovering its market-clearing level. Market-discovered pricing is the post-hackathon matching market.
- **Shares are non-transferable.** A transferable share would let a blocked holder sell the claim to a clean wallet and exit through it. Secondary transfer of stratified claims needs its own compliance path.
- **Live deposits need testnet USDC.** The Cleanverse institution faucet returned `transfer amount exceeds balance` for `usdc`, `ausdc` and `usdt` at the time of writing — its wallet is empty. The full deposit/withdraw path is therefore proven by the fork suite, which exercises the real Policy and A-Pass contracts with synthesized balances at the same addresses.
- **A-Pass tier granularity is not fully mapped.** `getTokenId(address)` is confirmed; the per-tokenId tier getter did not match ~35 candidate signatures in the implementation bytecode. `canTransfer` already encapsulates the tier check on-chain, and `POST /query_apass` supplies the tier off-chain, so nothing depends on the gap.
- **Single owner.** A production deployment wants a threshold signer set rather than one EOA.

---

## Layout

```
src/StrataResolver.sol           pure library - the contribution
src/StrataPool.sol               Ownable, ERC-20 shares, position-scoped compliance
src/interfaces/                  Cleanverse ABIs, hand-written from live bytecode
test/                            resolver fuzz, pool, audit regressions, fork
script/Deploy.s.sol              Monad testnet deployment
scripts/cleanverse.mjs           cooperate API client (AES-CBC + plain JSON)
scripts/mint-apass.mjs           mint a CVI credential
scripts/register-validator.mjs   register the pool with Cleanverse
web/                             Next.js stratum ledger
```

## Post-hackathon

- Configurable stratum schemas so issuers define their own jurisdiction and investor-class partitions
- Publish the compliance basis as a public feed — issuers currently cannot measure what their transfer restrictions cost in basis points
- The compliance-basis matching market: a party who legally *can* hold a blocked position bids on it at a discount, turning compliance friction into yield
- Explore alignment with ERC-7943 (uRWA) as a neutral interface
