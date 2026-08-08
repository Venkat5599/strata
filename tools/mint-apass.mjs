// Mint a Cleanverse A-Pass (CVI credential) to a wallet on Monad testnet.
//
//   node scripts/mint-apass.mjs <wallet-address> [tier]
//
// The demo needs two wallets that differ ONLY in whether they hold a credential:
// one verified, one not. That contrast is what makes the stratum split legible.

import {createClient, loadEnv} from "./cleanverse.mjs";
import crypto from "node:crypto";

const [, , wallet, tierArg] = process.argv;
if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
  console.error("usage: node scripts/mint-apass.mjs <0xwallet> [tier]");
  process.exit(1);
}

const env = loadEnv();
const cv = createClient(env);

// customerId: 12+ chars, A-Z a-z 0-9 only. No hyphens or underscores (docs v5.2).
const customerId = ("STRATA" + crypto.randomBytes(6).toString("hex")).replace(/[^A-Za-z0-9]/g, "");

const body = {
  customerId,
  kycSource: "STRATA-HACKATHON",
  kycId: customerId,
  expirationTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  override: false,
  wallet: {address: wallet, chain: "monad"},
  identityDataList: [
    {
      idType: "PASSPORT",
      fullName: "Strata Demo Investor",
      issuingCountryISO2: "SG",
    },
  ],
};
if (tierArg) body.subTier = Number(tierArg);

console.log(`minting A-Pass -> ${wallet} (customerId ${customerId})`);

try {
  const data = await cv.generateApass(body);
  console.log("generate_apass OK:", JSON.stringify(data));
} catch (err) {
  console.error("generate_apass FAILED:", err.message);
}

// Read it back. The registration is only real if the registry agrees it happened.
try {
  const q = await cv.queryApass({chain: "monad", address: wallet});
  console.log("query_apass:", JSON.stringify(q));
} catch (err) {
  console.error("query_apass:", err.message);
}
