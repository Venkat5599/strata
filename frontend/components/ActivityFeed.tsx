"use client";

import {EXPLORER_TX} from "@/lib/contracts";
import {usePoolLogs, EVENT_TOPICS, wordAt} from "@/lib/poolEvents";

// Real chain events, read via eth_getLogs on Monad testnet (shared walk in
// lib/poolEvents, cached per page load). Each row is a parsed event from the
// contract's logs — deposits, planned exits, blocks, basis changes. Nothing
// here is mocked.

type FeedRow = {
  tx: string;        // full tx hash, used for the explorer link
  txShort: string;   // display form
  kind: string;
  detail: string;
  when: string;
};

type DecodeCtx = {topics: string[]; data: string; word: (hex: string, i: number) => bigint};
const RENDERERS: Record<string, [string, (c: DecodeCtx) => string]> = {
  // Deposited(bytes32 indexed cviRef, address indexed account, uint8 stratumId, uint128 shares)
  // indexed: cviRef, account; data: (stratumId, shares)
  [EVENT_TOPICS.DEPOSITED]: [
    "Deposited",
    (c) => {
      const stratumId = Number(c.word(c.data, 0));
      const shares = Number(c.word(c.data, 1)) / 1e6;
      return `${shares.toLocaleString()} dUSDC → ${stratumId === 1 ? "VERIFIED" : "OPEN"}`;
    },
  ],
  // DepositedAToken(bytes32 indexed cviRef, address indexed account, uint128 shares)
  // indexed: cviRef, account; data: shares
  [EVENT_TOPICS.DEPOSITED_ATOKEN]: [
    "A-Token deposited",
    (c) => `${(Number(c.word(c.data, 0)) / 1e6).toLocaleString()} sCVA → VERIFIED`,
  ],
  // ExitPlanned(bytes32 indexed cviRef, address indexed account, uint8 branch, uint128 burnable, uint128 deferred, uint8 reason)
  // indexed: cviRef, account; data: branch, burnable, deferred, reason
  [EVENT_TOPICS.EXIT_PLANNED]: [
    "Exit planned",
    (c) => {
      const branch = Number(c.word(c.data, 0));
      const burnable = Number(c.word(c.data, 1)) / 1e6;
      return `${branch === 0 ? "DIRECT" : branch === 1 ? "ROUTED" : "BLOCKED"} · ${burnable.toLocaleString()} redeemable`;
    },
  ],
  // CredentialLinked(bytes32 indexed fromRef, bytes32 indexed toRef, address indexed account)
  [EVENT_TOPICS.CREDENTIAL_LINKED]: [
    "Credential linked",
    () => "position swept onto credential",
  ],
  // StratumBlocked(uint8 indexed stratumId, uint8 reason)
  [EVENT_TOPICS.STRATUM_BLOCKED]: [
    "Stratum blocked",
    (c) => (c.topics[0] === "1" ? "VERIFIED" : "OPEN") + " — revocation",
  ],
  // StratumUnblocked(uint8 indexed stratumId)
  [EVENT_TOPICS.STRATUM_UNBLOCKED]: [
    "Stratum unblocked",
    (c) => (c.topics[0] === "1" ? "VERIFIED" : "OPEN") + " — restored",
  ],
  // BasisChanged(uint8 indexed a, uint8 indexed b, int256 basis)  — basis in data
  [EVENT_TOPICS.BASIS_CHANGED]: [
    "Basis changed",
    (c) => {
      const raw = c.word(c.data, 0);
      // int256 is two's complement; a word with the high bit set is negative.
      const signed = raw > (1n << 255n) ? raw - (1n << 256n) : raw;
      return `${signed.toString()} bps OPEN · VERIFIED`;
    },
  ],
};

export function ActivityFeed() {
  const {logs, error: fetchErr} = usePoolLogs();

  const rows: FeedRow[] = [];
  for (const log of logs) {
    const topic = log.topics?.[0];
    const known = RENDERERS[topic];
    if (!known) continue;
    const topics = (log.topics ?? []).slice(1).map((t: string) => BigInt(t).toString());
    const data = log.data ?? "0x";
    const [kind, render] = known;
    const block = BigInt(log.blockNumber ?? 0).toString();
    const detail = render({topics, data, word: wordAt});
    const txHash = log.transactionHash ?? "";
    rows.push({
      tx: txHash,
      txShort: txHash.slice(0, 12) + "…",
      kind,
      detail,
      when: `#${block}`,
    });
  }
  const recent = rows.slice(-8).reverse();

  if (fetchErr) return <p className="feed-empty">activity feed unavailable: {fetchErr}</p>;
  if (recent.length === 0) return <p className="feed-empty">no pool events yet — deposits appear here as they land on-chain.</p>;

  return (
    <ul className="feed">
      {recent.map((r, i) => (
        <li key={i} className="feed-row">
          <span className={`feed-kind kind-${r.kind.split(" ")[0].toLowerCase()}`}>{r.kind}</span>
          <span className="feed-detail">{r.detail}</span>
          <a className="feed-tx" href={EXPLORER_TX(r.tx)} target="_blank" rel="noreferrer">{r.txShort}</a>
          <span className="feed-when">{r.when}</span>
        </li>
      ))}
    </ul>
  );
}
