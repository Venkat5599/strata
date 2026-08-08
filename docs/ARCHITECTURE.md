# STRATA — Architecture

Companion to `PRD.md`. Contract design, data model, and the resolver spec.

**Stack:** Solidity + Foundry, Monad testnet. Frontend: single static page, viem.

Foundry specifically because `forge fuzz` makes property tests on the resolver nearly free — and those tests are the project's credibility.

---

## 1. System shape

```
         ┌──────────────────────────────────────┐
         │            Frontend                  │
         │        (stratum ledger)              │
         └───────────────┬──────────────────────┘
                         │ viem
                         ▼
   ┌─────────────────────────────────────────────┐
   │  StrataPool.sol                             │
   │   deposit()  withdraw()  price()  basis()   │
   └──────┬───────────────────────────┬──────────┘
          │                           │
          ▼                           ▼
   ┌──────────────┐            ┌──────────────────┐
   │ Resolver.sol │            │ StratumRegistry  │
   │  resolve()   │◄───────────┤  .sol            │
   │  PURE        │            │  strata + state  │
   └──────┬───────┘            └──────────────────┘
          │ verifies signature
          ▼
   ┌───────────────────────────────────────┐
   │  PolicyAttestation (signed, off-chain)│
   │  sourced from Cleanverse CCP / CVI    │
   └───────────────────────────────────────┘
```

Four contracts. That is the entire protocol.

## 2. The decision that de-risks everything

`resolve()` accepts a **signed policy attestation as a function parameter**, verified on-chain with `ecrecover`. It does not call an oracle and does not assume a synchronous on-chain policy engine.

Why this matters: Cleanverse's docs are invitation-gated until registration, so at design time it is unknown whether the policy check is a contract call or a REST endpoint. The attestation-parameter form **works under either**. If the docs reveal a synchronous on-chain hook, one call site changes and the architecture is untouched.

Build this version first regardless of what the docs say.

## 3. Data model

```solidity
struct Stratum {
    uint8   minTier;      // 0 = open, 1+ = CVI tier required
    bytes32 cvaOrigin;    // CVA origination attestation id
    uint64  lockUntil;    // unix seconds; 0 = no lock
    bool    blocked;      // set on credential revocation
}

struct Position {
    bytes32 cviHash;      // identity, NOT address
    uint128 shares;
    uint8   stratumId;
}

struct PolicyAttestation {
    bytes32 cviHash;
    uint8   tier;
    bool    verdict;
    uint64  expiry;       // unix seconds
    bytes   sig;          // signed by the trusted policy signer
}
```

**Positions key on `cviHash`, not `msg.sender`.** Wallets are authorized signers on an identity-owned position. This is what makes revocation and legal claim coherent — an address is not a legal person, a credential is.

Ship scope uses two strata:

| id | name | minTier | meaning |
|---|---|---|---|
| 0 | `OPEN` | 0 | no credential required |
| 1 | `VERIFIED` | 1 | CVI-held |

## 4. Resolver — the contribution

```solidity
enum Branch { Direct, Routed, Blocked }

struct ExitPlan {
    Branch  branch;
    uint128 burnable;   // shares legally redeemable now
    uint128 deferred;   // shares that are not
    uint8   reason;     // policy code when Blocked
}

function resolve(
    PolicyAttestation calldata att,
    Position[]         calldata pos,
    uint128                     requested
) external view returns (ExitPlan memory);
```

**Algorithm.** Verify the attestation signature and expiry. Sort candidate positions by `(clearsPolicy DESC, lockUntil ASC)`. Greedily fill `requested` from clearing positions into `burnable`; everything that cannot clear accumulates into `deferred`.

- `burnable == requested` → `Direct`
- `0 < burnable < requested` → `Routed`
- `burnable == 0` → `Blocked`, emit the reason code and enqueue for compliant liquidation

Keep it pure. No storage writes, no external calls. `StrataPool` applies the plan; the resolver only computes it.

### Fuzz invariants

These are the correctness argument. Run ≥10k iterations.

```
I1  burnable + deferred == requested
I2  burnable * price(stratum) <= legalClaim(attestation)
I3  stratum.blocked  =>  burnable == 0
I4  att.expiry <= block.timestamp  =>  branch == Blocked
```

I4 exists because an expired attestation silently passing as `Direct` is the failure mode that would matter most in production.

## 5. Pricing and basis

Each stratum prices the same underlying but differs in legal transferability, so each carries its own discount factor.

```solidity
function price(uint8 stratumId) public view returns (uint256);

function basis(uint8 a, uint8 b) external view returns (int256) {
    return int256(price(a)) - int256(price(b));
}
```

For the hackathon, the discount factor is a governance-set parameter per stratum, adjusted by `blocked` state. That is honest and sufficient — the contribution is *exposing the spread as a first-class on-chain value*, not discovering it. Market-discovered pricing is the post-hackathon matching market.

`basis()` is what widens on camera in demo beat 3.

## 6. Cleanverse integration points

| Capability | Where it lands |
|---|---|
| **CVI** | `att.tier` → stratum membership. Used as a risk parameter, not a gate. |
| **CVA** | `Stratum.cvaOrigin` — issuance-time attestation bound at deposit. Never retroactive. |
| **CCP** | Pre-transaction check producing the signed attestation; Travel Rule payload on `Routed` exits |
| **Playground** | Stratum rule schema designed and validated before wiring into contracts |

**If CVI/CVA are not deployed on Monad testnet:** deploy `MockCviRegistry` behind the identical interface. Decide this at H1, not H20 — it is a one-line constructor swap if planned for, and a rewrite if not.

## 7. Events

Drive the entire frontend off events; do not poll state.

```solidity
event Deposited (bytes32 indexed cviHash, uint8 stratumId, uint128 shares);
event ExitPlanned(bytes32 indexed cviHash, Branch branch,
                  uint128 burnable, uint128 deferred, uint8 reason);
event StratumBlocked(uint8 indexed stratumId, uint8 reason);
event BasisChanged (uint8 a, uint8 b, int256 basis);
```

`ExitPlanned` is the one the demo hangs on — beat 2 is literally this event rendered.

## 8. Frontend

One page. One component: the **stratum ledger**.

- Horizontal bar = pool balance, segmented by stratum, width ∝ shares
- Two price ticks above, one per stratum
- Labelled bracket between the ticks = the basis
- On `ExitPlanned`: `burnable` segment highlights, `deferred` greys out, caption reads `ROUTED — N% redeemable`
- On `StratumBlocked`: that segment flashes and desaturates, its tick drops, the bracket widens

Build nothing else. No dashboard, no routing, no component library. Every hour spent elsewhere is an hour not spent making beat 2 legible, and beat 2 is the project.

## 9. Repo layout

```
src/
  StrataPool.sol
  Resolver.sol
  StratumRegistry.sol
  interfaces/ICviRegistry.sol
  mocks/MockCviRegistry.sol
test/
  Resolver.t.sol          # fuzz — the four invariants
  StrataPool.t.sol        # integration
script/Deploy.s.sol
frontend/                 # single page + viem
README.md                 # deployed addresses, demo video, honest limitations
```

## 10. Threat model (brief, but say it in the README)

| Vector | Handling |
|---|---|
| Forged attestation | `ecrecover` against a registered policy signer |
| Replayed attestation | `expiry` + nonce per `cviHash` |
| Stratum-hopping to escape a lock | `lockUntil` is checked on the *position*, not the redeemer |
| Sybil via new wallet | Positions key on `cviHash`; a new address inherits nothing |
| Compromised policy signer | Single point of trust in ship scope. **State this openly** — a threshold signer set is the production answer. |

Naming the last one honestly is worth more with these judges than pretending it does not exist.

## 11. Build order

Strictly sequential. Do not start a stage before the previous one is green.

1. `Resolver.resolve()` pure + fuzz green — **no chain, no UI**
2. `StratumRegistry` + `StrataPool.deposit()`
3. `StrataPool.withdraw()` applying the three branches
4. Deploy to Monad testnet, drive it via `cast`
5. `price()` / `basis()`
6. Frontend ledger
7. Revocation path
8. CCP audit export

Stage 1 is the paper. If it is not correct, nothing after it matters.
