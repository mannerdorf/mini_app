import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

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
    const banTtl = await kv.ttl(ctx.banKey);
    if (typeof banTtl === "number" && banTtl > 0) {
      tooMany(res, banTtl);
      return false;
    }

    const count = await kv.incr(ctx.windowKey);
    if (count === 1) {
      await kv.expire(ctx.windowKey, ctx.windowSec);
    }
    if (count > ctx.limit) {
      const winTtl = await kv.ttl(ctx.windowKey);
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
    await kv.del(ctx.failKey);
  } catch {
    // ignore
  }
}

export async function markAuthFailure(ctx: RateLimitContext): Promise<void> {
  try {
    const fails = await kv.incr(ctx.failKey);
    if (fails === 1) {
      await kv.expire(ctx.failKey, DEFAULTS.failWindowSec);
    }
    if (fails >= ctx.banAfterFailures) {
      await kv.set(ctx.banKey, "1", { ex: ctx.banSec });
      await kv.del(ctx.failKey);
    }
  } catch {
    // ignore
  }
}

