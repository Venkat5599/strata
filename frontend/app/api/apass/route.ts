import {NextResponse} from "next/server";

// Server-side only. CLEANVERSE_API_KEY never reaches the browser, which is the concrete
// reason this app is a Next server app rather than a static page: the encrypted endpoints
// need a key a client bundle must never contain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.CLEANVERSE_API_BASE ?? "https://uatapi.cleanverse.com/api/cooperate";

export async function GET(req: Request) {
  const {rateLimit, clientIp} = await import("@/lib/rate-limit");
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return NextResponse.json({error: "rate limit exceeded"}, {status: 429});
  }

  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({error: "address query parameter required"}, {status: 400});
  }

  const apiId = process.env.CLEANVERSE_API_ID;
  if (!apiId) return NextResponse.json({error: "CLEANVERSE_API_ID not configured"}, {status: 503});

  const res = await fetch(BASE + "/query_apass", {
    method: "POST",
    headers: {"Content-Type": "application/json", "api-id": apiId},
    body: JSON.stringify({chain: "monad", address}),
    cache: "no-store",
  });

  const json = await res.json();
  return NextResponse.json(json, {status: res.ok ? 200 : 502});
}
