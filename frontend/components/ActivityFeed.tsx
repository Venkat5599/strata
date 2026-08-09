"use client";

import {useEffect, useState} from "react";
import {POOL} from "@/lib/contracts";
import {EXPLORER_TX} from "@/lib/contracts";

// Real chain events, read via eth_getLogs on Monad testnet. The feed shows what
// actually happened on the pool — deposits, planned exits, blocks, basis changes.
// Nothing here is mocked: each row is a parsed event from the contract's logs.
type FeedRow = {
  tx: string;
  kind: string;
  detail: string;
  when: string;
};

type DecodeCtx = {topics: string[]; data: string; word: (hex: string, i: number) => bigint};
const EVENT_TOPICS: Record<string, [string, (c: DecodeCtx) => string]> = {
  // Deposited(bytes32 indexed cviRef, address indexed account, uint8 stratumId, uint128 shares)
  // indexed: cviRef, account; data: (stratumId, shares)
  "0x9fa030d679bd1318a34ccc83b3148ee25d1a3e907d31f5f005cfaa309ddc6ec8": [
    "Deposited",
    (c) => {
      const stratumId = Number(c.word(c.data, 0));
      const shares = Number(c.word(c.data, 1)) / 1e6;
      return `${shares.toLocaleString()} dUSDC → ${stratumId === 1 ? "VERIFIED" : "OPEN"}`;
    },
  ],
  // ExitPlanned(bytes32 indexed cviRef, address indexed account, uint8 branch, uint128 burnable, uint128 deferred, uint8 reason)
  // indexed: cviRef, account; data: branch, burnable, deferred, reason
  "0x49aa93e097a2836a2e1501cc59c6b560e6f4da66d1d8e34d071579d73a5b65a1": [
    "Exit planned",
    (c) => {
      const branch = Number(c.word(c.data, 0));
      const burnable = Number(c.word(c.data, 1)) / 1e6;
      return `${branch === 0 ? "DIRECT" : branch === 1 ? "ROUTED" : "BLOCKED"} · ${burnable.toLocaleString()} redeemable`;
    },
  ],
  // CredentialLinked(bytes32 indexed fromRef, bytes32 indexed toRef, address indexed account)
  "0x7896befadce7a347c6501bfcacddb3d675cfe67d193acca83c9ec13fbf51476a": [
    "Credential linked",
    () => "position swept onto credential",
  ],
  // StratumBlocked(uint8 indexed stratumId, uint8 reason)
  "0x3c2dfac7b765bca0851c6dd2d4b51ee7e39b44eba13c019da9cc61f7640a32ef": [
    "Stratum blocked",
    (c) => (c.topics[0] === "1" ? "VERIFIED" : "OPEN") + " — revocation",
  ],
  // BasisChanged(uint8 indexed a, uint8 indexed b, int256 basis)  — basis in data
  "0xe2e60ac1b16e817889b60ddf6ba503589255c895fa2b4e3d0d6ced1e3e3963bd": [
    "Basis changed",
    (c) => {
      const raw = c.word(c.data, 0);
      // int256 is two's complement; a word with the high bit set is negative.
      const signed = raw > (1n << 255n) ? raw - (1n << 256n) : raw;
      return `${signed.toString()} bps OPEN · VERIFIED`;
    },
  ],
};

const RPC = "https://testnet-rpc.monad.xyz";

export function ActivityFeed() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Monad's public RPC caps eth_getLogs at a 100-block range per request
        // (413 beyond that), so the pool's history must be walked in 99-block
        // chunks. The pool's events cluster in two bands (deploy + the revocation
        // run), spread over ~8k blocks — so the walk is done in parallel batches
        // of 10 requests, keeping it to ~2s on a normal connection.
        const DEPLOY_BLOCK = 52157293; // pool creation, from the deploy receipt
        const KNOWN = Object.keys(EVENT_TOPICS);
        const wanted = 10;
        const RANGE = 9_000; // deploy .. deploy+9k covers every event so far
        const chunks: any[] = [];
        const asks: {from: number; to: number}[] = [];
        for (let from = DEPLOY_BLOCK; from < DEPLOY_BLOCK + RANGE; from += 99) {
          asks.push({from, to: from + 99});
        }
        for (let i = 0; i < asks.length && chunks.length < wanted; i += 10) {
          const batch = asks.slice(i, i + 10);
          const results = await Promise.all(
            batch.map(({from, to}) =>
              fetch(RPC, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                  jsonrpc: "2.0", id: 1, method: "eth_getLogs",
                  params: [{address: POOL, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [KNOWN]}],
                }),
              }).then((r) => r.json()).catch(() => null)
            )
          );
          for (const data of results) {
            if (data?.result?.length) chunks.push(...data.result);
          }
        }
        if (cancelled || chunks.length === 0) return;
        const out: FeedRow[] = [];
        const word = (hex: string, i: number) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
        for (const log of chunks.slice(-8).reverse()) {
          const topic = log.topics?.[0];
          const known = EVENT_TOPICS[topic];
          if (!known) continue;
          const topics = (log.topics ?? []).slice(1).map((t: string) => BigInt(t).toString());
          const data = log.data ?? "0x";
          // Each known event declares how to read its non-indexed payload.
          const [kind, render] = known;
          const block = BigInt(log.blockNumber ?? 0).toString();
          const detail = render({topics, data, word});
          out.push({
            tx: (log.transactionHash ?? "").slice(0, 12) + "…",
            kind,
            detail,
            when: `#${block}`,
          });
        }
        setRows(out.slice(0, 8));
      } catch (e) {
        if (!cancelled) setErr(String(e).slice(0, 60));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (err) return <p className="feed-empty">activity feed unavailable: {err}</p>;
  if (rows.length === 0) return <p className="feed-empty">no pool events yet — deposits appear here as they land on-chain.</p>;

  return (
    <ul className="feed">
      {rows.map((r, i) => (
        <li key={i} className="feed-row">
          <span className={`feed-kind kind-${r.kind.split(" ")[0].toLowerCase()}`}>{r.kind}</span>
          <span className="feed-detail">{r.detail}</span>
          <a className="feed-tx" href={EXPLORER_TX(r.tx)} target="_blank" rel="noreferrer">{r.tx}</a>
          <span className="feed-when">{r.when}</span>
        </li>
      ))}
    </ul>
  );
}
