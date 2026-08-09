// Cleanverse cooperate API encryption (mirror of tools/cleanverse.mjs, kept out of the
// server bundle so no key material is involved). AES-CBC with a fixed zero IV per the
// API spec; the key is the base64-decoded api-key. The fixed IV is what the API
// specifies - not a recommendation for other work (it leaks equality).

import crypto from "node:crypto";

const ZERO_IV = Buffer.alloc(16, 0);

function aesAlg(key: Buffer) {
  if (key.length === 32) return "aes-256-cbc";
  if (key.length === 24) return "aes-192-cbc";
  if (key.length === 16) return "aes-128-cbc";
  throw new Error(`unsupported api-key length: ${key.length} bytes`);
}

export function encrypt(plaintextObj: unknown, apiKeyB64: string): string {
  const key = Buffer.from(apiKeyB64, "base64");
  const cipher = crypto.createCipheriv(aesAlg(key), key, ZERO_IV);
  const json = JSON.stringify(plaintextObj);
  return Buffer.concat([cipher.update(json, "utf8"), cipher.final()]).toString("base64");
}
