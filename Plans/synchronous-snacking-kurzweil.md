# STRATA — Implementation Plan

## Context

STRATA is a hackathon build for **Cleanverse Build: Trusted Assets** (DeFi track, Monad testnet, submission Aug 9 23:59 UTC). The repo currently holds `PRD.md`, `ARCHITECTURE.md`, an icon, and a bare Foundry scaffold — zero contract code.

The thesis: a liquidity pool socializes ownership, so one non-compliant LP taints the pool in aggregate. The industry answer is to gate the whole pool, which fragments $32B of ERC-3643 assets into thin per-jurisdiction silos. STRATA moves the compliance boundary from the **pool** to the **position** — one balance, one price curve, N legal strata, and a withdrawal resolver that returns `Direct` / `Routed` / `Blocked` instead of reverting.

**What changed today and why this plan supersedes ARCHITECTURE.md §2.** The Cleanverse docs were invitation-gated at design time, so `ARCHITECTURE.md` hedged: `resolve()` would take a *signed off-chain attestation* as a parameter, verified with `ecrecover`, because it was unknown whether the policy check was a contract call or REST-only. That question is now answered with live evidence — the check is a **synchronous on-chain call**. The hedge is deleted. STRATA reads compliance directly from Cleanverse's own deployed Policy contract, which removes the single-trusted-signer weakness named in `ARCHITECTURE.md` §10 and makes the integration first-class rather than adjacent.

### Verified facts (probed live, 2026-08-08)

Monad testnet, chainId **10143**, RPC `https://testnet-rpc.monad.xyz`:

| Contract | Address | Role |
|---|---|---|
| USDC (origin) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | underlying |
| **aUSDC (CVA A-Token)** | `0xaC0893567D43C3E7e6e35a72803df05416C1f20D` | pool asset, 6 dec |
| AccessCore | `0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC` | USDC ⇄ aUSDC wrap gateway |
| **A-Pass (CVI)** | `0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9` | ERC-721 identity |
| **Policy / Validator** | `0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd` | compliance engine |

All five are ERC-1967 proxies. Confirmed live returns:
- `Policy.canTransfer(address,address,address,uint256)` → `true`
- `Policy.apass()` → the A-Pass address above (self-consistent with the REST response)
- `Policy.isTokenRegistered(aUSDC)` → `true`; `Policy.isPaused(aUSDC)` → `false`; `Policy.getRules(aUSDC)` → `[]`
- Policy also exposes `getRules`, `isFrozen(token,user)`, `setPaused`, `removeRule`, `setFrozen`, and errors `ComplianceFailed`, `CountryBlacklisted`, `InvalidTier`, `InvalidSubTier`
- A-Pass exposes `getTokenId(address)`, `freeze/unfreeze/revoke`, `STATUS_ACTIVE/STATUS_FREEZED`, `ISSUER_ROLE`
- REST sandbox live: `POST /query_deposit_atoken_list` and `POST /validator/rules` both return `code: "0000"`

API base `https://uatapi.cleanverse.com/api/cooperate`, header `api-id`. Encrypted endpoints use AES/CBC/PKCS5, **fixed 16-zero-byte IV**, key = Base64-decoded `api-key`, body `{"data":"<b64>"}`. Read endpoints (`is_register`, `rules`, `verify`, `is_paused`) are plain JSON.

Docs are mirrored locally at `cleanverse-docs.txt` (gitignored; the access cookie expires ~8h).

---

## Approach

Four contracts, a Next.js app, and a registration script. Build order is strictly sequential — stage N does not start until N−1 is green.

### 1. `src/StrataResolver.sol` — pure library (the contribution)

The paper. No storage, no external calls, fully fuzzable.

```solidity
enum Branch {Direct, Routed, Blocked}

struct Position {bytes32 cviRef; uint128 shares; uint8 stratumId;}
struct StratumState {uint8 minTier; uint64 lockUntil; bool blocked;}
struct RedeemerView {uint8 tier; bool frozen; bool policyOk; uint64 timestamp;}
struct ExitPlan {Branch branch; uint128 burnable; uint128 deferred; uint8 reason;}

function resolve(RedeemerView memory v, Position[] memory pos, StratumState[] memory strata, uint128 requested)
    internal pure returns (ExitPlan memory);
```

Algorithm: order candidate positions by `(clearsPolicy DESC, lockUntil ASC)`; greedily fill `requested` from clearing positions into `burnable`; the rest accumulates into `deferred`. `burnable == requested` → `Direct`; `0 < burnable < requested` → `Routed`; `burnable == 0` → `Blocked` with a reason code.

`RedeemerView` is the seam: the pool populates it from live Policy/A-Pass reads, and tests populate it from fuzz input. This is what keeps the resolver pure while the pool stays on-chain-integrated.

### 2. `src/interfaces/` — Cleanverse ABIs

`ICleanversePolicy.sol` (`canTransfer`, `getRules`, `isFrozen`, `isPaused`, `isTokenRegistered`, `apass`) and `IAPass.sol` (`getTokenId`, `ownerOf`, `balanceOf`). Hand-written from the introspected selectors; only the functions STRATA actually calls.

**One unresolved parameter order** — `canTransfer(address,address,address,uint256)` was probed with `from == to`, so the argument order is not yet pinned. Stage 2 opens with a disambiguating fork test (`canTransfer(aUSDC, holder, zeroAddr, 1)` vs the permutation) before any code depends on it. Cheap to check, expensive to get wrong.

### 3. `src/StrataPool.sol` — `Ownable`, ERC-20 shares

Asset is **aUSDC**. `Ownable` is required so the Cleanverse `/validator/register` owner-signature flow can verify `owner()`.

- `deposit(uint256 assets)` — reads `apass.getTokenId(msg.sender)` and the Policy tier, assigns `stratumId` (0 `OPEN` / 1 `VERIFIED`), mints shares stamped with `cviRef = keccak256(abi.encode(apassTokenId))`. Positions key on the credential, not the address — a new wallet inherits nothing.
- `withdraw(uint256 shares)` — builds `RedeemerView` from `policy.canTransfer(...)` + `policy.isFrozen(aUSDC, msg.sender)` + tier, calls `StrataResolver.resolve`, applies the plan, emits `ExitPlanned`.
- `price(uint8)` / `basis(uint8,uint8)` — governance-set discount factor per stratum, adjusted by `blocked`. Honest and sufficient; the contribution is *exposing the spread as a first-class on-chain value*, not discovering it.
- `syncStratum(uint8)` — re-reads Policy and flips `blocked` on revocation. Permissionless; this is the beat-3 trigger.

Reentrancy: OZ `ReentrancyGuard`, plus CEI ordering — burn shares before `safeTransfer`. Use OZ `SafeERC20`.

### 4. `test/StrataResolver.t.sol` — the credibility argument

Fuzz at 10 000 runs (50 000 under the `ci` profile), enforcing the four invariants from `ARCHITECTURE.md` §4:

```
I1  burnable + deferred == requested
I2  burnable <= sum(shares of positions that clear policy)
I3  stratum.blocked  =>  burnable == 0
I4  redeemer frozen  =>  branch == Blocked
```

Plus `test/StrataPool.fork.t.sol` — a Monad fork test running deposit → withdraw against the **real** Policy and A-Pass contracts, not mocks. This is what separates STRATA from a project that only tested against its own stubs.

### 5. `script/Deploy.s.sol` + `script/register-validator.ts`

Deploy to Monad testnet, then register the pool with Cleanverse:
1. `personal_sign("monad" + poolAddressLowercaseHex)` with the deployer key (EIP-191, no separator, per docs)
2. AES-encrypt `{chain, contract_address, owner_signature, rule:{...}}` and `POST /validator/register`
3. Verify with plain-JSON `POST /validator/is_register` and `POST /validator/rules`

`src/lib/cleanverse-crypto.ts` implements the AES/CBC/zero-IV codec once and is shared by the script and the Next.js API routes.

### 6. `web/` — Next.js 15 App Router

- `app/page.tsx` — one route. The **stratum ledger** is the only component that matters: a horizontal bar (pool balance) segmented by stratum, a price tick per stratum, and a labelled bracket between them showing the basis. On `ExitPlanned` the burnable segment highlights and the remainder greys out with the caption `ROUTED — N% redeemable`. On `StratumBlocked` the segment desaturates, its tick drops, and the bracket widens.
- `app/api/apass/route.ts` and `app/api/ccp/export/route.ts` — server-side only, so `CLEANVERSE_API_KEY` never reaches the browser. This is the concrete reason for choosing Next over a static page.
- Driven off contract **events** via viem `watchContractEvent`, not polling.

Design follows the anti-slop law in `~/.claude/CLAUDE.md`: no purple/blue gradients, no pill badges, no icon-in-a-tile, no filled+outlined button pair, content visible by default (never gated behind an entrance animation). The signature artifact is the ledger bar itself — it carries the page, and nothing else competes with it.

---

## Files

**New**
```
src/StrataResolver.sol              # pure library — the contribution
src/StrataPool.sol                  # Ownable, ERC-20 shares, aUSDC
src/StratumRegistry.sol             # stratum schema + blocked state
src/interfaces/ICleanversePolicy.sol
src/interfaces/IAPass.sol
test/StrataResolver.t.sol           # 4 fuzz invariants, 10k runs
test/StrataPool.t.sol               # integration, mocked Policy
test/StrataPool.fork.t.sol          # Monad fork vs REAL Cleanverse contracts
script/Deploy.s.sol
script/register-validator.ts        # owner_signature + AES + /validator/register
src/lib/cleanverse-crypto.ts        # AES/CBC/zero-IV codec (shared)
web/                                # Next.js 15 app
FINDINGS.md                         # the six H0 answers + verified addresses
```

**Modified**
- `ARCHITECTURE.md` — rewrite §2 (attestation hedge → direct on-chain read), §6 (real addresses), §10 (drop "compromised policy signer"; the trust root is now Cleanverse's own contract)
- `PRD.md` — mark §11 open questions answered, inline the evidence
- `README.md` — deployed addresses, demo video, honest limitations
- `foundry.toml`, `.gitignore`, `.env.example` — already written this session

**Already done:** `git init`, Foundry scaffold, OpenZeppelin v5.4.0 installed, `.env` written and confirmed gitignored, `foundry.toml` configured (solc 0.8.28, 10k fuzz runs, Monad RPC endpoint).

---

## Sequencing against the deadline

~38h remain. `PRD.md` §8 fixes the cut ladder — cut `basis()`, then CCP export, then the revocation beat, then the second stratum. **Never cut** `resolve()`, the fuzz tests, or demo beat 2.

| Block | Work | Gate |
|---|---|---|
| 1 | `canTransfer` arg-order fork test; interfaces | order pinned by a real call |
| 2 | Resolver + 4 fuzz invariants green | `forge test` 10k runs, no chain, no UI |
| 3 | Registry + Pool deposit/withdraw; unit tests | `forge test` green |
| 4 | Deploy to Monad; drive via `cast` | tx hashes on testnet |
| 5 | `/validator/register` + verify via `is_register` | `code: "0000"`, rules readable |
| 6 | `price()` / `basis()` | **H24 checkpoint** |
| 7 | Next.js stratum ledger, beats 1–3 clickable | screenshot per beat |
| 8 | Revocation path + CCP audit export | report file produced |
| 9 | Demo video, README, submit to isaac@cleanverse.com | before Aug 9 23:59 UTC |

Commit after every green gate — the hackathon **requires** commit history inside the Aug 8–9 window.

---

## Verification

Each stage proves itself with a real probe, not an assertion that it should work.

1. **`canTransfer` order** — `cast call` both permutations against `0x36489bE4…` with distinct `from`/`to`; the one that behaves asymmetrically pins the signature.
2. **Resolver** — `forge test --match-contract StrataResolver -vvv` with 10 000 fuzz runs; all four invariants green. Then `FOUNDRY_PROFILE=ci forge test` at 50 000 runs before submission.
3. **Fork test** — `forge test --match-contract Fork --fork-url $MONAD_RPC_URL`; deposit and withdraw execute against the live Policy and A-Pass, proving the integration is real.
4. **Deployment** — `cast call <pool> "basis(uint8,uint8)(int256)"` on Monad testnet returns a value; addresses go in the README so judges can call the contract themselves.
5. **Validator registration** — `POST /validator/is_register` returns registered, and `POST /validator/rules` echoes the rule we set. Both are plain-JSON reads, so they are trivially reproducible by a judge.
6. **Revocation beat** — read `basis()`, freeze the credential, call `syncStratum`, read `basis()` again; the delta is the on-chain price of a transfer restriction widening. Capture both reads.
7. **Frontend** — `Skill("Interceptor")` screenshot at each of the four demo beats, confirming beat 2 (`ROUTED — N% redeemable`) is legible to a non-technical viewer. Per `PRD.md` §7, if beat 2 is not unmistakable the project reads as a whitelist, so this gate is not optional.
8. **CCP export** — hit `/api/ccp/export`, confirm a file is produced covering the session.

### Risks carried

- **Sandbox may reject `/validator/register` for a self-deployed Monad contract.** Detected at block 5, not at hour 40. Fallback: keep the read-only on-chain integration, which is already complete by then, and state the limitation plainly in the README. Candour scores at a compliance company.
- **A-Pass tier getter not yet identified.** `getTokenId(address)` is confirmed; the per-tokenId tier getter did not match ~35 candidate names. Workaround: `Policy.canTransfer` already encapsulates the tier check for the on-chain path, and `POST /query_apass` returns the tier for the UI. Not blocking.
- **No A-Pass credential minted yet.** `POST /generate_apass` is AES-encrypted and needs a 12+ char alphanumeric `customerId`. Do this early in block 5 — the demo needs one verified and one unverified wallet.
