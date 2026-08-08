# STRATA — one-page summary

**Cleanverse Build: Trusted Assets Hackathon · DeFi track · Monad testnet**
Repo: https://github.com/Venkat5599/strata

---

## Problem

A liquidity pool socializes ownership: one asset balance, many claimants. If a single LP is unverified or sanctioned, the pool's holdings are non-compliant **in aggregate**. Every compliant venue therefore gates the entire pool — Uniswap v4 shipped Permissioned Pools doing exactly this. The ERC-3643 literature concedes the cost: restricting to verified entities "narrows the participant pool," and the "liquidity tradeoff is real."

The result is over $32B of tokenized assets fragmented into thin, per-investor-class silos. A tokenized T-bill fund with US-accredited, EU-professional and Singapore-AI classes runs three separate pools, with three price curves, for one identical underlying asset.

## Solution

STRATA moves the compliance boundary from the **pool** to the **position**.

Deposits mint shares stamped with the depositor's CVI credential. One asset balance, one price curve, N legal strata. Withdrawal runs through a pure resolver returning `Direct` (fully legal), `Routed` (burn only the legally-redeemable subset), or `Blocked` (no legal path — the claim defers, and the attempt is still recorded on-chain with a reason code).

Because strata differ in legal transferability, they differ in price. That gap — the **compliance basis** — is the first live on-chain price for what a transfer restriction costs an issuer. It reads `225 bps` on the deployed pool today, and widens on revocation.

**The finding the design rests on.** Probing the live Cleanverse Policy contract showed that `canTransfer` **reverts** when a party holds no A-Pass — it does not return `false`. A revert is legally coarse: it treats *"58% of this is legally yours"* as identical to *"none of it is."* STRATA catches that revert and grades the result. Cleanverse's own primitive answers non-compliance with a hard failure; STRATA converts it into a graded, explicable outcome.

## CVI · CVA integration points

Not adjacent to the protocol — read synchronously, on-chain, on every exit.

| Point | Integration | Proof |
|---|---|---|
| **CVI — A-Pass** | `credentialOf()` reads the on-chain ERC-721 credential. Positions key on the **credential**, never on `msg.sender`: an address is not a legal person, a credential is, so a fresh wallet inherits nothing and revocation reaches every wallet sharing it. | Minted via `POST /generate_apass` (tier 50, tx `0x80db3087…`), confirmed on-chain `balanceOf == 1` |
| **CVI — Policy** | `policyClears()` calls `Policy.canTransfer`, mapping its revert to `false`. `isFrozen()` drives the `Blocked` branch. | Fork tests assert both revert and success paths against the live contract |
| **CVA — A-Token, referenced** | aUSDC is the instrument every policy question is denominated in; rules bind to a registered A-Token. Verified at construction. | `isTokenRegistered(aUSDC) == true`; constructor rejects plain USDC |
| **CVA — A-Token, custodied** | `depositAToken()` takes aUSDC directly, so the pool **holds real aUSDC**. Lots record their backing, and an A-Token claim settles back in the A-Token rather than a plain-token substitute. | Fork tests deposit and redeem aUSDC against the live deployment |
| **CVI — pool credential** | The pool holds **its own A-Pass**, minted through the same `/generate_apass` path a user takes. No contract can receive an A-Token without one. | `A-Pass.balanceOf(pool) == 1`, tx `0xfea66697...` |
| **CCP** | `/api/ccp/export` produces a downloadable audit record combining pool state with the live credential record; api-key stays server-side. | Next.js server route |
| **Validator** | Pool registered through the **write** path with an EIP-191 owner signature verified against the on-chain `owner()` — which is why the pool is `Ownable`. | `register` tx `0xfba1314b…`, `is_register: true`, rules echo `min_tier: 1` |

Remove any one and STRATA is just a whitelist.

## Deployed — Monad testnet (chainId 10143)

```
StrataPool   0xe747e5adbde5363564e7b2d2c2c3199fae46a64e   (registered compliance pool)
Owner        0x28b53f72f7a87a67A57c05fFb76d5D52D1d88dF0
USDC         0x534b2f3A21130d7a60830c2Df862319e593943A3   (pooled asset)
aUSDC (CVA)  0xaC0893567D43C3E7e6e35a72803df05416C1f20D   (referenced AND custodied)
A-Pass (CVI) 0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9
Policy       0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd
Validator    0xaC7e5179C2C7f03f209136886c172eb34F161792
```

Judges can call it directly:

```bash
cast call 0xe747e5adbde5363564e7b2d2c2c3199fae46a64e "basis(uint8,uint8)(int256)" 1 0 \
  --rpc-url https://testnet-rpc.monad.xyz     # 225
```

## Build quality

**47 tests, 0 failures** — 11 resolver fuzz (invariants I1–I4 at 10 000 runs each), 12 pool integration, 9 audit regressions, 15 fork tests against the **real** Cleanverse contracts, three of which prove live aUSDC custody end to end.

**Security audit: four findings, all fixed, each with a regression test that fails against the pre-fix contract** — including one HIGH where anyone could halt every redemption from a stratum and drive its price to zero. Full detail in the README.

Nine further bugs were caught by tests and screenshots rather than by review, among them silent fund loss when a party was verified after depositing, and a ledger that painted the whole bar redeemable — overstating the one number this demo must never overstate.

## Honest limitations

Partial exit has no legal precedent; it is a proposal. Discount factors are governance-set — the contribution is exposing the spread as a first-class on-chain value, not discovering its market-clearing level. Shares are non-transferable, because a transferable share would let a blocked holder launder an exit through a clean wallet. The Cleanverse institution faucet was empty at submission time, so deposits - aUSDC custody included - are proven by the fork suite against the live deployment rather than by faucet-funded transfers. Wrapping USDC into aUSDC through AccessCore needs a deposit membership only Cleanverse can grant; STRATA does not require it, because verified parties deposit aUSDC they already hold. A production deployment wants a threshold signer set, not one EOA.
