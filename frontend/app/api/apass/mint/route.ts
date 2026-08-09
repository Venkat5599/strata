import {NextResponse} from "next/server";

// Mint a Cleanverse A-Pass for the connected wallet. Server-side only:
// the API key stays in the server env, exactly like /api/apass. This is what
// lets a reviewer go from "fresh wallet" to "verified LP" without leaving the
// dashboard - the same /generate_apass path the deploy tools use.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.CLEANVERSE_API_BASE ?? "https://uatapi.cleanverse.com/api/cooperate";

export async function POST(req: Request) {
  const {rateLimit, clientIp} = await import("@/lib/rate-limit");
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return NextResponse.json({error: "rate limit exceeded"}, {status: 429});
  }

  let body: {address?: string};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: "invalid JSON body"}, {status: 400});
  }
  const address = body.address;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({error: "address required"}, {status: 400});
  }

  const apiId = process.env.CLEANVERSE_API_ID;
  const apiKey = process.env.CLEANVERSE_API_KEY;
  if (!apiId || !apiKey) {
    return NextResponse.json({error: "Cleanverse credentials not configured"}, {status: 503});
  }

  // AES-CBC encryption, per the Cleanverse cooperate API (mirrors tools/cleanverse.mjs).
  const {encrypt} = await import("@/lib/cleanverse-crypto");
  const customerId = "STRATA" + Math.random().toString(36).slice(2, 10).toUpperCase();

  const plaintext = {
    customerId,
    kycSource: "STRATA-HACKATHON",
    kycId: customerId,
    expirationTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    override: false,
    wallet: {address, chain: "monad"},
    identityDataList: [
      {idType: "PASSPORT", fullName: "Strata Demo Investor", issuingCountryISO2: "SG"},
    ],
    subTier: 50,
  };

  const res = await fetch(BASE + "/generate_apass", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-id": apiId,
      "X-Request-ID": crypto.randomUUID(),
    },
    body: JSON.stringify({data: encrypt(plaintext, apiKey)}),
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok || (json.code && json.code !== "0000")) {
    return NextResponse.json({error: json.message ?? "generate_apass failed"}, {status: 502});
  }
  return NextResponse.json(json.data ?? json);
}
