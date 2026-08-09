# STRATA — one-page summary

**Cleanverse Build: Trusted Assets Hackathon · DeFi track · Monad testnet**
Repo: https://github.com/Venkat5599/strata · Live: https://strata-monad-nine.vercel.app

---

## Problem

A compliance pool socializes ownership, so one non-compliant LP taints the
whole pool. The industry answer gates the pool in aggregate — every LP pays
the strictest restriction. Worse, Cleanverse's own `canTransfer` primitive
answers non-compliance with a **hard revert**, so a partially-compliant
withdrawal fails entirely: an LP who legally owns 58% of a position can
withdraw none of it.

## Solution

STRATA moves the compliance boundary from the **pool** to the **position**:
one balance, one price curve, N legal strata (OPEN / VERIFIED), and a
withdrawal resolver that **grades instead of reverting** — returning
`Direct`, `Routed`, or `Blocked` with the burnable/deferred split and the
on-chain reason. Compliance partitions by credential, positions re-attribute
when credentials change, and the blocked branch prices at zero — so the
**compliance basis** (`basis(a,b) = price(a) − price(b)`) becomes the first
on-chain price of a transfer restriction.

- `previewExit(address, shares)` — pure view, grades any request, no wallet
- `deposit` / `depositAToken` — shares stamped with the depositor's credential
- `linkCredential` — migrates anonymous lots to the credential on upgrade
- `syncStratum` — permissionless mirror of the Policy pause state
- `setStratumBlocked` — owner acts on a reported credential revocation
- Four resolver invariants (conservation, no over-release, revocation
  absolute, freeze dominates) fuzzed at 10,000 runs; 48 tests green
  (33 local + 15 fork against the live Cleanverse contracts)

## CVI · CVA integration points

| Primitive | Role in STRATA | Live state |
|---|---|---|
| **CVI · A-Pass** (`0xbA82D189…`) | `credentialOf()` reads the on-chain ERC-721 credential; positions key on the credential, never on `msg.sender` | Pool holds its own A-Pass (`balanceOf(pool) == 1`, cvRecord 2089); verified LP tier 50 |
| **CVA · A-Token** (`Policy.isTokenRegistered`) | the registered instrument every policy question is denominated in | `isTokenRegistered(sCVA) == true`; constructor rejects unregistered tokens |
| **Policy** (`0x36489bE4…`) | `policyClears()` wraps `canTransfer` (revert → `false`); `isPaused` drives the Blocked branch | aUSDC registered, policy unpaused — chips verified live on the dashboard |
| **CVA · custodied** | `depositAToken()` takes a registered A-Token directly | **Live**: pool custodies 250,000 sCVA — our own CVA, minted by us, deposited via real `depositAToken` (tx `0x7b489ad6`) |
| **Validator** | pool registered via `POST /validator/register` with an EIP-191 owner signature | `is_register: true`, rules `min_tier: 1`, tx `0x983586fd` |
| **CCP export** | `/api/ccp/export` — downloadable audit record combining pool state + live credential | server route, API key never reaches the browser |

## Deployed

**Chain:** Monad testnet (10143) · RPC `https://testnet-rpc.monad.xyz`

| Contract | Address | State |
|---|---|---|
| StrataPool | `0x04df73761E1e524C0112D9a3633A44F8924BC31D` | registered validator, populated: OPEN 150,000 / VERIFIED 255,000 |
| sCVA (our CVA) | `0xa4C1B2d93D1F6A1cF83047C0C068ac15DEf7224f` | Policy-registered, 250,000 custodied in the pool |
| A-Pass (CVI) | `0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9` | pool + verified LP hold credentials |
| Cleanverse Policy | `0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd` | aUSDC registered, unpaused |
| dUSDC (pooled asset) | `0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242` | open-mint demo dollar |

**App:** https://strata-monad-nine.vercel.app (landing + dashboard; every number a live contract read).

**Honest notes:** testnet USDC has no open mint and the USDC→aUSDC conversion
is blocked upstream, so the OPEN stratum pools dUSDC and the custodied CVA is
our own sCVA — both per Cleanverse's sanctioned guidance ("issuing your own
CVA is permitted"). The pool architecture is unchanged for USDC-backed
custody the moment their conversion pipeline works.
