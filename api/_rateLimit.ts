import type { VercelRequest, VercelResponse } from "@vercel/node";

type RateLimitContext = {
  namespace: string;
  ipHash: string;
  loginHash: string;
  windowKey: string;
  failKey: string;
  banKey: string;
  windowSec: number;
  limit: number;
  banAfterFailures: number;
  banSec: number;
};

const DEFAULTS = {
  windowSec: 60, // 1 minute
  limit: 8, // requests per window
  banAfterFailures: 12, // consecutive failures (within fail window) -> ban
  banSec: 15 * 60, // 15 min ban
  failWindowSec: 15 * 60, // failures counter TTL
};

// Edge-safe small hash (no Node "crypto" dependency): FNV-1a 32-bit
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // hash *= 16777619 (with 32-bit overflow)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

type UpstashRestResult<T> = { result: T; error?: string };

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

function hasKvConfig(): boolean {
  return Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
}

async function kvFetch<T>(path: string): Promise<T> {
  if (!hasKvConfig()) throw new Error("KV not configured");
  const base = KV_REST_API_URL!.endsWith("/") ? KV_REST_API_URL! : `${KV_REST_API_URL!}/`;
  const url = `${base}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 600);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
      signal: controller.signal,
    });
    const json = (await res.json()) as UpstashRestResult<T>;
    if (!res.ok) throw new Error(json?.error || `KV error: ${res.status}`);
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

async function kvIncr(key: string): Promise<number> {
  return kvFetch<number>(`incr/${encodeURIComponent(key)}`);
}

async function kvExpire(key: string, sec: number): Promise<number> {
  return kvFetch<number>(`expire/${encodeURIComponent(key)}/${sec}`);
}

async function kvTtl(key: string): Promise<number> {
  return kvFetch<number>(`ttl/${encodeURIComponent(key)}`);
}

async function kvDel(key: string): Promise<number> {
  return kvFetch<number>(`del/${encodeURIComponent(key)}`);
}

async function kvSetEx(key: string, value: string, sec: number): Promise<"OK" | string> {
  return kvFetch<"OK" | string>(
    `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${sec}`
  );
}

export function getClientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  const xrip = req.headers["x-real-ip"];
  if (typeof xrip === "string" && xrip.trim()) return xrip.trim();
  // @ts-expect-error: VercelRequest is Node req underneath
  return req.socket?.remoteAddress || "unknown";
}

export function createRateLimitContext(args: {
  namespace: string;
  ip: string;
  login?: string;
  windowSec?: number;
  limit?: number;
  banAfterFailures?: number;
  banSec?: number;
}): RateLimitContext {
  const ipHash = shortHash(args.ip || "unknown");
  const loginHash = shortHash((args.login || "").toLowerCase().trim());
  const namespace = args.namespace;
  const windowSec = args.windowSec ?? DEFAULTS.windowSec;
  const limit = args.limit ?? DEFAULTS.limit;
  const banAfterFailures = args.banAfterFailures ?? DEFAULTS.banAfterFailures;
  const banSec = args.banSec ?? DEFAULTS.banSec;

  const keyBase = `${namespace}:${ipHash}:${loginHash}`;
  return {
    namespace,
    ipHash,
    loginHash,
    windowKey: `rl:win:${keyBase}`,
    failKey: `rl:fail:${keyBase}`,
    banKey: `rl:ban:${keyBase}`,
    windowSec,
    limit,
    banAfterFailures,
    banSec,
  };
}

function tooMany(res: VercelResponse, retryAfterSec: number) {
  res.setHeader("Retry-After", String(retryAfterSec));
  return res.status(429).json({
    error: "Слишком много попыток. Попробуйте позже.",
    retryAfterSec,
  });
}

export async function enforceRateLimit(
  res: VercelResponse,
  ctx: RateLimitContext
): Promise<boolean> {
  // Returns true if allowed, false if blocked (response already sent).
  try {
    const banTtl = await kvTtl(ctx.banKey);
    if (typeof banTtl === "number" && banTtl > 0) {
      tooMany(res, banTtl);
      return false;
    }

    const count = await kvIncr(ctx.windowKey);
    if (count === 1) {
      await kvExpire(ctx.windowKey, ctx.windowSec);
    }
    if (count > ctx.limit) {
      const winTtl = await kvTtl(ctx.windowKey);
      tooMany(res, typeof winTtl === "number" && winTtl > 0 ? winTtl : ctx.windowSec);
      return false;
    }
    return true;
  } catch {
    // If KV isn't configured (dev/local) or temporary outage – do not block.
    return true;
  }
}

export async function markAuthSuccess(ctx: RateLimitContext): Promise<void> {
  try {
    await kvDel(ctx.failKey);
  } catch {
    // ignore
  }
}

export async function markAuthFailure(ctx: RateLimitContext): Promise<void> {
  try {
    const fails = await kvIncr(ctx.failKey);
    if (fails === 1) {
      await kvExpire(ctx.failKey, DEFAULTS.failWindowSec);
    }
    if (fails >= ctx.banAfterFailures) {
      await kvSetEx(ctx.banKey, "1", ctx.banSec);
      await kvDel(ctx.failKey);
    }
  } catch {
    // ignore
  }
}

