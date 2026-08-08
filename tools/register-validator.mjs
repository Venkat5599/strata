// Register StrataPool as a Cleanverse Validator compliance pool.
//
//   node scripts/register-validator.mjs <poolAddress> <ownerSignature>
//
// The signature is produced separately with the deployer key so this script never touches
// private key material. Cleanverse verifies it against the on-chain owner() of the pool,
// which is why StrataPool is Ownable.

import {createClient, loadEnv} from "./cleanverse.mjs";

const [, , pool, signature] = process.argv;
if (!pool || !signature) {
  console.error("usage: node scripts/register-validator.mjs <poolAddress> <ownerSignature>");
  process.exit(1);
}

const cv = createClient(loadEnv());
const chain = "monad";
const contract_address = pool.toLowerCase();

// min_tier 1 mirrors the VERIFIED stratum: the pool declares to Cleanverse the same bar it
// enforces in resolve(). Registering a rule the contract does not honour would make the
// registration decorative.
const rule = {
  allowed_group: "",
  allowed_sub_group: "",
  min_tier: 1,
  min_sub_tier: 0,
  is_black_list: false,
  countries: [],
};

console.log(`registering ${contract_address} on ${chain}`);

try {
  const data = await cv.validatorRegister({chain, contract_address, rule, owner_signature: signature});
  console.log("register OK:", JSON.stringify(data));
} catch (err) {
  console.error("register FAILED:", err.message);
}

// Read back. The registration is only real if the validator agrees it happened.
for (const [label, fn] of [
  ["is_register", () => cv.validatorIsRegistered(chain, contract_address)],
  ["rules", () => cv.validatorRules(chain, contract_address)],
]) {
  try {
    console.log(`${label}:`, JSON.stringify(await fn()));
  } catch (err) {
    console.error(`${label}:`, err.message);
  }
}
