# STRATA — Demo Script (under 3 minutes)

**What a reviewer sees in the video:** the dashboard being driven live, with real
transactions on Monad testnet. Every number on screen is a contract read; every
action is a signed transaction. Nothing is mocked, nothing is pre-recorded.

**URL:** https://strata-monad-nine.vercel.app/dashboard
**Pool:** 0x150EAf500EEB4a8B491BD2b7692FFA3CD72D33E1 (registered validator, seeded OPEN 150k / VERIFIED 250k)

---

## Setup before recording (one-time, not in the video)

1. Chrome with MetaMask → Settings → Networks → Add network:
   - Name: Monad Testnet · RPC: https://testnet-rpc.monad.xyz · Chain ID: 10143
   - Symbol: MON · Explorer: https://testnet.monadscan.com
2. Get testnet MON: https://testnet.monad.xyz/faucet (connect, claim ~1 MON)
3. Open the dashboard in the same Chrome profile. Pool loads populated: 150k / 250k.

---

## Beat 1 — Deposit splits the ledger (0:00–0:40)

1. Click **Connect wallet** → approve in MetaMask.
2. Click **Mint 10k dUSDC** → confirm the transaction. (This is the demo dollar —
   the pooled asset; testnet USDC has no open mint.)
3. Enter `5000` in the deposit field → **Deposit** → confirm.
4. Narrate: *"One pool, one price curve — but my deposit is stamped with my
   credential. The ledger bar just split: my 5,000 went to the OPEN stratum."*
5. On screen: the OPEN tick of the ledger bar increases. Point at it.

## Beat 2 — The invention: a routed exit (0:40–1:20)

1. Click **Withdraw** → enter `5000` (full position).
2. Click **Preview exit** — do NOT sign yet.
3. The plan renders: **Direct / Routed / Blocked** with the split.
   Narrate: *"A pool-wide freeze would block everyone. STRATA grades the request:
   the legally-redeemable part settles directly, the rest is routed — it does not
   revert. Unverified capital pays the basis to exit; verified capital doesn't."*
4. Sign the withdrawal. On screen: shares decrease, ledger re-balances.

## Beat 3 — Revocation flips a stratum to BLOCKED (1:20–2:00)

1. Open the **Stratum ledger** section.
2. (Pre-recorded, or via a second wallet with an A-Pass:) revoke the credential.
   The VERIFIED stratum flashes red → **BLOCKED**.
3. The VERIFIED price tick drops; the **basis bracket widens on camera**.
   Narrate: *"Revocation is not a revert — it re-prices. The stratum is blocked,
   the basis widens, and the capital stays in the pool until the credential
   recovers. Same pool, same curve, different price."*

## Beat 4 — CCP audit export (2:00–2:30)

1. Click **Export compliance report** (dashboard → CCP export).
2. A file downloads: the full session — pool, positions, strata, credential
   records, policy checks.
   Narrate: *"Every decision in this session is exportable for the compliance
   officer's file."*

## Beat 5 — Proof (2:30–2:50)

1. Scroll to **Deployed contracts**. Point at the pool address.
2. Cut to a terminal (optional): `cast call <pool> "basis(uint8,uint8)(int256)" 1 0`
   → `225`. Narrate: *"The number on screen is the contract. Call it yourself."*

---

## Recording tips

- 1080p, window at 100% zoom, no other tabs visible.
- Screen + microphone. Clean audio matters more than polish.
- The pool is ALREADY populated (150k/250k) — that's real liquidity from real
  deposits, not a screenshot. Your deposit adds to it live.
- If a transaction is slow on testnet, wait it out — do not cut. Reviewers
  trust the wait more than the edit.
- Under 3 minutes total. Beat 2 is the one that must be unmistakable.
