import type {Address} from "viem";
import {CLEANVERSE, POOL_ADDRESS} from "./strata";

export const POOL = POOL_ADDRESS as Address;
export const USDC = CLEANVERSE.usdc as Address;

export const EXPLORER_TX = (h: string) => `https://testnet.monadexplorer.com/tx/${h}`;
export const EXPLORER_ADDR = (a: string) => `https://testnet.monadexplorer.com/address/${a}`;

export const poolWriteAbi = [
  {type: "function", name: "syncStratum", stateMutability: "nonpayable",
   inputs: [{name: "stratumId", type: "uint8"}], outputs: []},
  {type: "function", name: "deposit", stateMutability: "nonpayable",
   inputs: [{name: "assets", type: "uint256"}], outputs: [{name: "shares", type: "uint256"}]},
  {type: "function", name: "withdraw", stateMutability: "nonpayable",
   inputs: [{name: "shares", type: "uint128"}],
   outputs: [{name: "plan", type: "tuple", components: [
     {name: "branch", type: "uint8"}, {name: "burnable", type: "uint128"},
     {name: "deferred", type: "uint128"}, {name: "reason", type: "uint8"}]}]},
  {type: "function", name: "basis", stateMutability: "view",
   inputs: [{name: "a", type: "uint8"}, {name: "b", type: "uint8"}], outputs: [{name: "", type: "int256"}]},
  {type: "function", name: "price", stateMutability: "view",
   inputs: [{name: "id", type: "uint8"}], outputs: [{name: "", type: "uint256"}]},
  {type: "function", name: "policyClears", stateMutability: "view",
   inputs: [{name: "account", type: "address"}], outputs: [{name: "", type: "bool"}]},
] as const;
