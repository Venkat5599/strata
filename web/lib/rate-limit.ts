// Minimal in-memory sliding-window rate limiter for API routes.
// Per-IP window: DEFAULT_LIMIT requests per WINDOW_MS. Serverless-friendly: state
// lives for the lifetime of the process, which is the correct granularity for
// protecting the Cleanverse upstream (per-instance, not globally).

type Bucket = {count: number; resetAt: number};
const buckets = new Map<string, Bucket>();

export const WINDOW_MS = 60_000;
export const DEFAULT_LIMIT = 30; // 30 req/min per IP

export function rateLimit(ip: string, limit = DEFAULT_LIMIT): {ok: boolean; remaining: number} {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, {count: 1, resetAt: now + WINDOW_MS});
    return {ok: true, remaining: limit - 1};
  }
  b.count += 1;
  if (b.count > limit) {
    return {ok: false, remaining: 0};
  }
  return {ok: true, remaining: limit - b.count};
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
