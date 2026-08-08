// Chain wiring and the shared vocabulary of the STRATA ledger.

import {createPublicClient, http, defineChain, type Address} from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
  rpcUrls: {default: {http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"]}},
});

// Live Cleanverse deployments on Monad testnet, confirmed by direct eth_call.
export const CLEANVERSE = {
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  ausdc: "0xaC0893567D43C3E7e6e35a72803df05416C1f20D",
  apass: "0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9",
  policy: "0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd",
} as const;

export const POOL_ADDRESS = (process.env.NEXT_PUBLIC_POOL_ADDRESS ?? "") as Address | "";

export const publicClient = createPublicClient({chain: monadTestnet, transport: http()});

export const poolAbi = [
  {
    type: "function",
    name: "previewExit",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}, {name: "shares", type: "uint128"}],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        {name: "branch", type: "uint8"},
        {name: "burnable", type: "uint128"},
        {name: "deferred", type: "uint128"},
        {name: "reason", type: "uint8"},
      ],
    }],
  },
  {
    type: "function",
    name: "basis",
    stateMutability: "view",
    inputs: [{name: "a", type: "uint8"}, {name: "b", type: "uint8"}],
    outputs: [{name: "", type: "int256"}],
  },
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [{name: "stratumId", type: "uint8"}],
    outputs: [{name: "", type: "uint256"}],
  },
] as const;

export const BRANCH = ["DIRECT", "ROUTED", "BLOCKED"] as const;
export type Branch = (typeof BRANCH)[number];

// Mirrors StrataTypes reason codes. Kept in the same order as the Solidity constants so a
// drift shows up as an obviously wrong label rather than a silently plausible one.
export const REASON = [
  "",
  "credential frozen",
  "policy check failed",
  "stratum blocked",
  "position locked",
  "tier below stratum minimum",
  "no position held",
  "request exceeds position",
] as const;

export type Stratum = {
  id: number;
  name: string;
  shares: number;
  priceBps: number;
  blocked: boolean;
};

export const fmtUsdc = (v: number) => (v / 1e6).toLocaleString(undefined, {maximumFractionDigits: 2});
export const fmtBps = (v: number) => `${v >= 0 ? "+" : ""}${v} bps`;
