/**
 * In-memory rate limiter (per serverless instance).
 * Keys: prefix + client IP. Window: 60 seconds.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();
const WINDOW_MS = 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

/** Returns client IP from Vercel request (x-forwarded-for or x-real-ip). */
export function getClientIp(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]?.trim()
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined;
  const realIp = req.headers?.["x-real-ip"];
  const rip = typeof realIp === "string" ? realIp.trim() : undefined;
  return ip || rip || "unknown";
}

/**
 * Check rate limit. Returns true if limited (should return 429), false if allowed.
 * Call this before processing the request.
 */
export function isRateLimited(prefix: string, key: string, limit: number): boolean {
  prune();
  const now = Date.now();
  const fullKey = `${prefix}:${key}`;
  let entry = store.get(fullKey);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(fullKey, entry);
  }
  entry.count++;
  return entry.count > limit;
}

/** Limits for admin: login strict, API more permissive */
export const ADMIN_LOGIN_LIMIT = 10;   // 10 попыток входа в минуту с одного IP
export const ADMIN_API_LIMIT = 120;    // 120 запросов в минуту на критичные API с одного IP
