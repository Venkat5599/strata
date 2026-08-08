// Cleanverse cooperate API client.
//
// Two transport shapes, per the v5.6 docs:
//   plain JSON  - validator reads (is_register, rules, verify, is_paused), fiat ramp
//   encrypted   - everything that mutates, sent as {"data":"<base64 ciphertext>"}
//
// The cipher is AES-256-CBC with a FIXED all-zero 16-byte IV and the key being the
// base64-decoded api-key. A fixed IV is not something to copy into other work: identical
// plaintexts produce identical ciphertexts, so it leaks equality. It is what the API
// specifies, so it is what the client does, and this note is here so the choice is not
// mistaken for a recommendation.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ZERO_IV = Buffer.alloc(16, 0);

export function loadEnv(file = ".env") {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return {...out, ...process.env};
}

export function encrypt(plaintextObj, apiKeyB64) {
  const key = Buffer.from(apiKeyB64, "base64");
  const cipher = crypto.createCipheriv(aesAlg(key), key, ZERO_IV);
  const json = JSON.stringify(plaintextObj);
  return Buffer.concat([cipher.update(json, "utf8"), cipher.final()]).toString("base64");
}

export function decrypt(ciphertextB64, apiKeyB64) {
  const key = Buffer.from(apiKeyB64, "base64");
  const decipher = crypto.createDecipheriv(aesAlg(key), key, ZERO_IV);
  const raw = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// The docs say "AES" without naming a key size; the size is implied by the key material.
function aesAlg(key) {
  if (key.length === 32) return "aes-256-cbc";
  if (key.length === 24) return "aes-192-cbc";
  if (key.length === 16) return "aes-128-cbc";
  throw new Error(`unsupported api-key length: ${key.length} bytes`);
}

export function createClient(env = loadEnv()) {
  const base = env.CLEANVERSE_API_BASE ?? "https://uatapi.cleanverse.com/api/cooperate";
  const apiId = env.CLEANVERSE_API_ID;
  const apiKey = env.CLEANVERSE_API_KEY;
  if (!apiId) throw new Error("CLEANVERSE_API_ID missing - see .env.example");

  async function call(endpoint, body, {encrypted = false} = {}) {
    if (encrypted && !apiKey) throw new Error("CLEANVERSE_API_KEY required for encrypted endpoints");
    const payload = encrypted ? {data: encrypt(body, apiKey)} : body;

    const res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-id": apiId,
        "X-Request-ID": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${endpoint}: non-JSON response (${res.status}): ${text.slice(0, 300)}`);
    }

    // A non-"0000" code is a real failure. The one documented exception is validator/verify,
    // where HTTP 200 with valid:false is a compliance OUTCOME, not an API error - callers
    // must read data.valid rather than treating a clean response as approval.
    if (json.code && json.code !== "0000") {
      throw new Error(`${endpoint}: ${json.code} ${json.message ?? ""}`.trim());
    }
    return json.data ?? json;
  }

  return {
    base,
    call,
    // --- validator (plain JSON reads) ---
    validatorRules: (chain, contract_address) => call("/validator/rules", {chain, contract_address}),
    validatorIsRegistered: (chain, contract_address) =>
      call("/validator/is_register", {chain, contract_address}),
    validatorIsPaused: (chain, contract_address) =>
      call("/validator/is_paused", {chain, contract_address}),
    validatorVerify: (chain, contract_address, user_address) =>
      call("/validator/verify", {chain, contract_address, user_address}),

    // --- validator (encrypted writes) ---
    validatorGrant: (body) => call("/validator/grant", body, {encrypted: true}),
    validatorRegister: (body) => call("/validator/register", body, {encrypted: true}),
    validatorAddRule: (body) => call("/validator/add_rule", body, {encrypted: true}),
    validatorSetRule: (body) => call("/validator/set_rule", body, {encrypted: true}),

    // --- identity + assets ---
    generateApass: (body) => call("/generate_apass", body, {encrypted: true}),
    queryApass: (body) => call("/query_apass", body),
    queryApassList: (body) => call("/query_apass_list", body),
    atokenList: (chain, symbol) => call("/query_deposit_atoken_list", symbol ? {chain, symbol} : {chain}),
    downloadTravelRule: (body) => call("/download_travel_rule", body),
  };
}
