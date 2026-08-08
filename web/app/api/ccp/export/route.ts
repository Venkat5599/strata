import {NextResponse} from "next/server";

// CCP audit export. Produces the compliance record for a session as a downloadable file.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.CLEANVERSE_API_BASE ?? "https://uatapi.cleanverse.com/api/cooperate";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  const apiId = process.env.CLEANVERSE_API_ID;

  const record: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    chain: "monad",
    chainId: 10143,
    pool: process.env.NEXT_PUBLIC_POOL_ADDRESS ?? null,
    subject: address || null,
    cleanverse: {
      apass: "0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9",
      policy: "0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd",
      aToken: "0xaC0893567D43C3E7e6e35a72803df05416C1f20D",
    },
  };

  // Attach the live credential record when one is available, so the export reflects the
  // registry rather than what this server believes about it.
  if (apiId && address) {
    try {
      const res = await fetch(BASE + "/query_apass", {
        method: "POST",
        headers: {"Content-Type": "application/json", "api-id": apiId},
        body: JSON.stringify({chain: "monad", address}),
        cache: "no-store",
      });
      const json = await res.json();
      record.credential = json.data ?? json;
    } catch (err) {
      record.credential = {error: String(err)};
    }
  }

  return new NextResponse(JSON.stringify(record, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="strata-ccp-audit.json"',
    },
  });
}
