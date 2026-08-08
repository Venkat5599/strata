# STRATA — Product Requirements

**Compliance-partitioned liquidity.** One pool, one price curve, multiple legal strata.

- **Event:** Cleanverse Build: Trusted Assets Hackathon
- **Track:** DeFi — Compliant DeFi
- **Build window:** Aug 8 00:00 → Aug 9 23:59 UTC (48h)
- **Team:** solo
- **Chain:** Monad testnet
- **Status:** scope locked, ship-safe variant

---

## 1. Problem

A liquidity pool socializes ownership: one asset balance, many claimants. If a single LP is unverified, sanctioned, or in the wrong jurisdiction, the pool's holdings are non-compliant **in aggregate**.

The industry's answer is to gate the whole pool. Uniswap v4 shipped Permissioned Pools on 2026-07-23 doing exactly this. The cost is conceded inside the ERC-3643 literature: restricting to verified entities "narrows the participant pool," the "liquidity tradeoff is real," and off-chain validation "introduces latency… which can slow order execution and widen spreads."

Result: over $32B of ERC-3643 assets sit in thin, fragmented, per-investor-class silos.

**Concrete case.** A tokenized T-bill fund with US-accredited, EU-professional, and Singapore-AI investor classes must run three separate pools with three price curves for one identical underlying asset.

## 2. Why now

Three things converged:

1. Tokenized RWA supply crossed a threshold where fragmentation is a measurable cost, not a hypothetical.
2. Pool-level permissioning shipped from a major venue three weeks ago, making the coarse solution the default — and its limitation the obvious next problem.
3. Cleanverse's CVI/CVA give issuance-time identity and provenance primitives. Without them, per-position compliance has nothing to key on.

## 3. Solution

Move the compliance boundary from the **pool** to the **position**.

- Deposits mint shares stamped with the depositor's CVI tier and the asset's CVA origination attestation.
- One asset balance. One price curve. N strata.
- Withdrawal runs through a **resolver** returning one of three outcomes:
  - `Direct` — redeemer clears every restriction on the shares
  - `Routed` — redeemer clears a subset; burn only the legally-redeemable portion
  - `Blocked` — no legal path; position enters the compliant liquidation queue
- Because strata differ in legal transferability, they differ in price. That gap — the **compliance basis** — is the first live on-chain price for what a transfer restriction costs.

### The design principle that matters

Compliance is bound at **issuance**, never applied retroactively. Retroactive taint-marking has been rejected in crypto since the Coinvalidation debate — the canonical objection being that it "would destroy" fungibility. CVA's origination attestation is the right shape: cleanliness is a property of a *claim*, not of a coin.

## 4. Users

| User | Need | What STRATA gives them |
|---|---|---|
| RWA issuer | Secondary liquidity without breaking transfer restrictions | One deep pool instead of N thin ones |
| Verified LP | Yield on restricted assets | Access to the full pool, priced for their tier |
| Unverified LP | Any legal exit at all | Partial redemption instead of a hard revert |
| Compliance officer | Provable enforcement + audit trail | CCP pre-transaction checks, Travel Rule payloads, exportable report |

## 5. Scope

### In (locked)

- One pool, one asset
- **Two strata:** `VERIFIED` (CVI tier ≥ 1) and `OPEN` (no credential)
- Three exit branches: Direct / Routed / Blocked
- Per-stratum pricing and a `basis()` readout
- Credential revocation → stratum flips to Blocked
- CCP audit export
- Stratum ledger frontend (single page)

### Out (do not build)

- Credit scores, defaulter registries, credit limits — prior art shows six teams across four hackathons in this cluster (`credora`, `credx`, `lyhva`, `branq`, `rsrv`, `credencechain-2`) with zero wins
- The compliance-basis matching market (post-hackathon)
- A third stratum
- Anything described as "lending"
- Mainnet

## 6. Success criteria

| # | Criterion | Verification |
|---|---|---|
| S1 | Verified + unverified LP hold positions in the **same pool** on the **same curve** | On-chain state read; single balance, two strata |
| S2 | Unverified full-withdrawal returns `Routed`, not a revert | Tx succeeds, burns a strict subset, event emitted |
| S3 | `resolve()` passes all four fuzz invariants | `forge test` green, ≥10k runs |
| S4 | Revocation flips a stratum to Blocked and widens the basis | Before/after `basis()` read, visible in UI |
| S5 | Audit report exports for the full session | File produced via CCP |
| S6 | Demo video shows beats 1–4 in under 3 minutes | Recorded |
| S7 | README lists live Monad testnet addresses | Judges can call the contract themselves |

**H24 gate:** S1–S3 done and screen-recorded. If not, cut per §8 and stop adding scope.

## 7. Demo script

Single visual: the **stratum ledger** — one horizontal bar (pool balance) split by colour into strata, two price ticks above it, a labelled bracket between them showing the basis.

1. Two LPs deposit. Bar splits into two colours. Say: *"same pool, same curve."*
2. Unverified LP requests full withdrawal → legally-redeemable segment highlights, remainder greys out, caption `ROUTED — 58% redeemable`. **Not a revert. A partial.** ← the invention
3. Revoke the credential → stratum flashes red, flips `BLOCKED`, its price tick drops, **the basis bracket widens on camera.**
4. Export the CCP audit report.

Beat 2 must be unmistakable to a non-technical viewer. If it isn't, the project reads as a whitelist.

## 8. Cut ladder (pre-decided)

Cut in this order, no deliberation during the build:

1. `basis()` readout
2. CCP audit export
3. Revocation beat
4. Second stratum

**Never cut:** `resolve()`, the fuzz tests, or demo beat 2.

## 9. Timeline (solo, 40 working hours)

| Window | Deliverable |
|---|---|
| H0–H3 | Docs read, six API questions answered, one CVI credential minted end-to-end. **Blocker gate — do not proceed until this works.** |
| H3–H9 | `resolve()` pure + fuzz green. No chain, no UI. |
| H9–H15 | Pool contract, deployed to Monad testnet. |
| H15–H18 | Sleep. |
| H18–H24 | Per-stratum pricing + `basis()`. **H24 CHECKPOINT.** |
| H24–H32 | Stratum ledger frontend, beats 1–3 clickable. |
| H32–H36 | Revocation path + CCP audit export. |
| H36–H40 | Sleep. |
| H40–H44 | Record demo, write README. |
| H44–H46 | **Submit.** |
| H46–H48 | Buffer. |

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Policy check is REST-only, not on-chain | High | Resolver takes a signed attestation as a **parameter** — works under either API shape. Swap the call site in ~20 min if a synchronous hook exists. |
| CVI exposes only a boolean, no tier | Medium | Two strata already only need a boolean. Design degrades cleanly. |
| CVI/CVA not deployed on Monad testnet | High | Deploy a local mock registry behind the same interface. Decide at H1, not H20. |
| Beat 2 not visually legible | High | Ledger visual is the only frontend work. Build nothing else. |
| Solo fatigue | Medium | Two sleep blocks are in the plan and are not optional. |
| Partial exit has no legal precedent | Low (for judging) | State it plainly in the README. Candour scores at a compliance company. |

## 11. Open questions — answer at H0 from the docs

1. Is the policy check callable **from a smart contract** (synchronous), or REST-only?
2. Does CVA expose the origination attestation **on-chain** (id or hash)?
3. Is revocation **observable on-chain**, or poll-only? What latency?
4. Does CVI expose a **tier** field, or only a boolean?
5. Can custom policy rules (jurisdictions, lock-ups) be defined in Playground, or is the rule set fixed?
6. Are CVI/CVA **already deployed on Monad testnet**?

Q1 decides architecture. Q4 decides whether strata are rich or binary. Q6 decides whether H0–H3 is enough.

## 12. Post-hackathon

- Configurable stratum schemas — issuers define their own jurisdiction and investor-class partitions
- Publish the compliance basis as a public feed; issuers currently cannot measure what their transfer restrictions cost in basis points
- Compliance-basis matching market: a party who legally *can* hold a blocked position bids on it at a discount, turning compliance friction into yield
- Explore alignment with ERC-7943 (uRWA) as a neutral interface
