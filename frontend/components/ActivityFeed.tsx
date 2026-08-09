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
    (c) => `${(Number(c.word(c.data, 0)) / 100)} bps OPEN · VERIFIED`,
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
        // Monad's public RPC caps eth_getLogs to a 100-block range, so we fetch the
        // latest block and walk a short window back (the pool is young; all its
        // events are recent). Chunked reads keep each request inside the cap.
        const latestHex = await (await fetch(RPC, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: []}),
        })).json().then((d) => d.result);
        const latest = Number(BigInt(latestHex));
        const DEPLOY_BLOCK = 52157293; // pool creation, from the deploy receipt
        // Walk the pool's whole life in 99-block chunks (public RPC caps at 100).
        // Stop early once a chunk returns logs — the pool is young, events cluster
        // at the start, and we only render the most recent ones.
        const chunks: any[] = [];
        for (let from = DEPLOY_BLOCK; from <= latest && chunks.length === 0; from += 99) {
          const to = Math.min(from + 99, latest);
          const res = await fetch(RPC, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "eth_getLogs",
              params: [{address: POOL, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16)}],
            }),
          });
          const data = await res.json();
          if (data.result?.length) chunks.push(...data.result);
        }
        // If the deploy-era chunk is empty (RPC lag), fall back to the last 400 blocks.
        if (chunks.length === 0) {
          for (let from = Math.max(DEPLOY_BLOCK, latest - 400); from <= latest && chunks.length === 0; from += 99) {
            const to = Math.min(from + 99, latest);
            const res = await fetch(RPC, {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "eth_getLogs",
                params: [{address: POOL, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16)}],
              }),
            });
            const data = await res.json();
            if (data.result?.length) chunks.push(...data.result);
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
