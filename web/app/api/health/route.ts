import {NextResponse} from "next/server";

// Health check. Proves the server is configured and can reach its upstreams.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiId = process.env.CLEANVERSE_API_ID;
  const apiKey = process.env.CLEANVERSE_API_KEY;
  const pool = process.env.NEXT_PUBLIC_POOL_ADDRESS;

  const checks = {
    cleanverseApiId: Boolean(apiId),
    cleanverseApiKey: Boolean(apiKey),
    poolConfigured: Boolean(pool),
  };
  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {status: ok ? "ok" : "degraded", checks},
    {status: ok ? 200 : 503},
  );
}
