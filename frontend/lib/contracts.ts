import type {Address} from "viem";
import {CLEANVERSE, POOL_ADDRESS} from "./strata";

export const POOL = POOL_ADDRESS as Address;
export const USDC = CLEANVERSE.usdc as Address;
export const AUSDC = CLEANVERSE.ausdc as Address;
// Our own Cleanverse CVA (sCVA), launched via /atoken/launch — the custodied
// A-Token the pool's VERIFIED stratum is backed by (depositAToken path).
export const CVA = (process.env.NEXT_PUBLIC_CLEANVERSE_CVA ??
  "0xa4C1B2d93D1F6A1cF83047C0C068ac15DEf7224f") as Address;
export const APASS = CLEANVERSE.apass as Address;
export const POLICY = CLEANVERSE.policy as Address;

export const EXPLORER_TX = (h: string) => `https://testnet.monadexplorer.com/tx/${h}`;
export const EXPLORER_ADDR = (a: string) => `https://testnet.monadexplorer.com/address/${a}`;

// Write surface of StrataPool plus the ERC-20 approval flow. Mirrors the deployed
// contract; regenerated from `forge inspect StrataPool abi`.
export const poolWriteAbi = [
  {type: "function", name: "syncStratum", stateMutability: "nonpayable",
   inputs: [{name: "stratumId", type: "uint8"}], outputs: []},
  {type: "function", name: "deposit", stateMutability: "nonpayable",
   inputs: [{name: "assets", type: "uint256"}], outputs: [{name: "shares", type: "uint256"}]},
  {type: "function", name: "depositAToken", stateMutability: "nonpayable",
   inputs: [{name: "amount", type: "uint256"}], outputs: [{name: "shares", type: "uint256"}]},
  {type: "function", name: "withdraw", stateMutability: "nonpayable",
   inputs: [{name: "shares", type: "uint128"}],
   outputs: [{name: "plan", type: "tuple", components: [
     {name: "branch", type: "uint8"}, {name: "burnable", type: "uint128"},
     {name: "deferred", type: "uint128"}, {name: "reason", type: "uint8"}]}]},
  {type: "function", name: "linkCredential", stateMutability: "nonpayable",
   inputs: [], outputs: [{name: "migrated", type: "bool"}]},
  {type: "function", name: "basis", stateMutability: "view",
   inputs: [{name: "a", type: "uint8"}, {name: "b", type: "uint8"}], outputs: [{name: "", type: "int256"}]},
  {type: "function", name: "price", stateMutability: "view",
   inputs: [{name: "id", type: "uint8"}], outputs: [{name: "", type: "uint256"}]},
  {type: "function", name: "policyClears", stateMutability: "view",
   inputs: [{name: "account", type: "address"}], outputs: [{name: "", type: "bool"}]},
] as const;

export const erc20Abi = [
  {type: "function", name: "approve", stateMutability: "nonpayable",
   inputs: [{name: "spender", type: "address"}, {name: "value", type: "uint256"}],
   outputs: [{name: "", type: "bool"}]},
  {type: "function", name: "allowance", stateMutability: "view",
   inputs: [{name: "owner", type: "address"}, {name: "spender", type: "address"}],
   outputs: [{name: "", type: "uint256"}]},
  {type: "function", name: "balanceOf", stateMutability: "view",
   inputs: [{name: "account", type: "address"}], outputs: [{name: "", type: "uint256"}]},
  // Open-mint demo dollar (DemoUSDC). Testnet only; lets a reviewer fund their own
  // deposit without an external faucet.
  {type: "function", name: "mint", stateMutability: "nonpayable",
   inputs: [{name: "to", type: "address"}, {name: "amount", type: "uint256"}],
   outputs: []},
] as const;
