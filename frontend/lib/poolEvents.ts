"use client";

import {useEffect, useState} from "react";
import {POOL} from "@/lib/contracts";

// Shared, module-level cache of the pool's real event logs. Both ActivityFeed and
// ExitResolver derive what they show from the SAME fetched logs, so the (slow,
// chunked) eth_getLogs walk runs once per page load. All events are real —
// nothing is mocked.

export const EVENT_TOPICS = {
  DEPOSITED: "0x9fa030d679bd1318a34ccc83b3148ee25d1a3e907d31f5f005cfaa309ddc6ec8",
  EXIT_PLANNED: "0x49aa93e097a2836a2e1501cc59c6b560e6f4da66d1d8e34d071579d73a5b65a1",
  DEPOSITED_ATOKEN: "0x1c51bcbb075c5b495765e26180eec8beae9675e10945ae13c5c28a9cc72edc1b",
  CREDENTIAL_LINKED: "0x7896befadce7a347c6501bfcacddb3d675cfe67d193acca83c9ec13fbf51476a",
  STRATUM_BLOCKED: "0x3c2dfac7b765bca0851c6dd2d4b51ee7e39b44eba13c019da9cc61f7640a32ef",
  BASIS_CHANGED: "0xe2e60ac1b16e817889b60ddf6ba503589255c895fa2b4e3d0d6ced1e3e3963bd",
} as const;

const RPC = "https://testnet-rpc.monad.xyz";
const DEPLOY_BLOCK = 52157293; // pool creation, from the deploy receipt

let shared: Promise<any[]> | null = null;

function walkLogs(): Promise<any[]> {
  if (shared) return shared;
  shared = (async () => {
    // Monad's public RPC caps eth_getLogs at a 100-block range per request (413
    // beyond that), so the pool's history is walked in 99-block chunks, in
    // parallel batches of 10. The pool's events all sit within ~9k blocks of
    // deployment, so this covers them and stops there.
    const KNOWN = Object.values(EVENT_TOPICS);
    const chunks: any[] = [];
    const asks: {from: number; to: number}[] = [];
    for (let from = DEPLOY_BLOCK; from < DEPLOY_BLOCK + 9_000; from += 99) {
      asks.push({from, to: from + 99});
    }
    for (let i = 0; i < asks.length; i += 10) {
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
    return chunks;
  })();
  return shared;
}

export function usePoolLogs(): {logs: any[]; loading: boolean; error: string | null} {
  const [state, setState] = useState<{logs: any[]; loading: boolean; error: string | null}>({
    logs: [], loading: true, error: null,
  });

  useEffect(() => {
    let live = true;
    walkLogs()
      .then((logs) => live && setState({logs, loading: false, error: null}))
      .catch((e) => live && setState({logs: [], loading: false, error: String(e).slice(0, 80)}));
    return () => { live = false; };
  }, []);

  return state;
}

// ABI word reader: word i of hex data (0-indexed, 32-byte words).
export const wordAt = (hex: string, i: number): bigint =>
  BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
