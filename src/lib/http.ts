import type { NextRequest } from "next/server";

/**
 * CSRF guard for cookie-authenticated POSTs: the Origin header must be present
 * and match the Host we were reached on. Malformed origins (e.g. "null") fail.
 */
export function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Client IP for rate limiting. On Vercel, `x-vercel-forwarded-for` and
 * `x-forwarded-for` are set by Vercel's edge and client-supplied values are
 * overwritten, so they can be trusted there. Elsewhere (local dev, other hosts)
 * they are spoofable; the per-device limit still applies.
 */
export function clientIp(req: NextRequest) {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  return first(req.headers.get("x-vercel-forwarded-for")) ?? first(req.headers.get("x-forwarded-for")) ?? req.headers.get("x-real-ip") ?? "unknown";
}

export function isHttps(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}
