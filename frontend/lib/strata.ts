// Chain wiring and the shared vocabulary of the STRATA ledger.
// All addresses come from env with fallback to the live Monad testnet deployment.
// Nothing here is simulated; every value is a contract read or a real transaction.

import {createPublicClient, http, defineChain, type Address} from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"],
    },
  },
});

// Live deployments on Monad testnet (chainId 10143), confirmed by direct
// eth_call on 2026-08-08. Override per-environment via NEXT_PUBLIC_* vars.
// The pooled asset is DemoUSDC (dUSDC): testnet USDC has no open mint and the
// Cleanverse faucet is dry, so the demo pool pools a mintable test dollar while
// the compliance layer (aUSDC / Policy / A-Pass) stays fully real.
export const CLEANVERSE = {
  usdc: (process.env.NEXT_PUBLIC_CLEANVERSE_USDC ??
    "0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242") as Address,
  ausdc: (process.env.NEXT_PUBLIC_CLEANVERSE_AUSDC ??
    "0xaC0893567D43C3E7e6e35a72803df05416C1f20D") as Address,
  apass: (process.env.NEXT_PUBLIC_CLEANVERSE_APASS ??
    "0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9") as Address,
  policy: (process.env.NEXT_PUBLIC_CLEANVERSE_POLICY ??
    "0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd") as Address,
} as const;

export const POOL_ADDRESS = (process.env.NEXT_PUBLIC_POOL_ADDRESS ??
  "0x6BA9307946c52c1eac6A8d20613B4fe2C990F968") as Address;

export const publicClient = createPublicClient({chain: monadTestnet, transport: http()});

// Full StrataPool read surface. Mirrors the deployed contract; regenerated from
// `forge inspect StrataPool abi` - do not hand-edit, re-run the inspect.
export const poolReadAbi = [
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
  {
    type: "function",
    name: "stratumTotalShares",
    stateMutability: "view",
    inputs: [{name: "stratumId", type: "uint8"}],
    outputs: [{name: "", type: "uint128"}],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    type: "function",
    name: "stratum",
    stateMutability: "view",
    inputs: [{name: "stratumId", type: "uint8"}],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        {name: "minTier", type: "uint8"},
        {name: "lockUntil", type: "uint64"},
        {name: "blocked", type: "bool"},
      ],
    }],
  },
  {
    type: "function",
    name: "credentialOf",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "cviRef", type: "bytes32"}, {name: "tier", type: "uint8"}],
  },
  {
    type: "function",
    name: "deferredShares",
    stateMutability: "view",
    inputs: [{name: "cviRef", type: "bytes32"}],
    outputs: [{name: "", type: "uint128"}],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    type: "function",
    name: "policyClears",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "", type: "bool"}],
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
