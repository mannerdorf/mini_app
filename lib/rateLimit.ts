import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { getPool } from "../api/_db.js";

/** Trust forwarded addresses only from explicitly configured socket peers. */
export function getClientIp(req: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const peer = req.socket?.remoteAddress || "unknown";
  const trusted = new Set((process.env.TRUSTED_PROXY_IPS || "").split(",").map(v => v.trim()).filter(Boolean));
  if (!trusted.has(peer)) return peer;
  const raw = req.headers?.["x-forwarded-for"];
  const chain = (Array.isArray(raw) ? raw.join(",") : raw || "").split(",").map(v => v.trim());
  for (const ip of chain.reverse()) {
    if (!isIP(ip)) return peer;
    if (!trusted.has(ip)) return ip;
  }
  return peer;
}

/**
 * Check rate limit. Returns true if limited (should return 429), false if allowed.
 * Call this before processing the request.
 */
export async function isRateLimited(prefix: string, key: string, limit: number): Promise<boolean> {
  const bucket = createHash("sha256").update(JSON.stringify([prefix, key])).digest("hex");
  try {
    const { rows } = await getPool().query<{ limited: boolean }>(
      `WITH expired AS (
         SELECT bucket_key FROM request_rate_limits
         WHERE expires_at < now() - interval '5 minutes' AND bucket_key <> $1
         ORDER BY expires_at LIMIT 20 FOR UPDATE SKIP LOCKED
       ), cleanup AS (
         DELETE FROM request_rate_limits WHERE bucket_key IN (SELECT bucket_key FROM expired)
       )
       INSERT INTO request_rate_limits(bucket_key,hits,expires_at) VALUES($1,1,now()+interval '60 seconds')
       ON CONFLICT(bucket_key) DO UPDATE SET
         hits=CASE WHEN request_rate_limits.expires_at <= now() THEN 1 ELSE request_rate_limits.hits+1 END,
         expires_at=CASE WHEN request_rate_limits.expires_at <= now() THEN now()+interval '60 seconds' ELSE request_rate_limits.expires_at END
       RETURNING hits > $2 AS limited`, [bucket, limit],
    );
    return rows[0]?.limited !== false;
  } catch {
    // No per-process fallback: unavailable shared storage must not disable protection.
    return true;
  }
}

/** Limits for admin: login strict, API more permissive */
export const ADMIN_LOGIN_LIMIT = 10;   // 10 попыток входа в минуту с одного IP
export const ADMIN_API_LIMIT = 120;    // 120 запросов в минуту на критичные API с одного IP

/** Limits for auth endpoints (brute-force protection) */
export const AUTH_LOGIN_LIMIT = 15;        // 15 попыток входа в минуту с одного IP
export const AUTH_CHANGE_PASSWORD_LIMIT = 5; // 5 попыток смены пароля в минуту с одного IP
export const AUTH_2FA_VERIFY_LIMIT = 10;    // 10 попыток проверки 2FA-кода в минуту с одного IP
export const AUTH_2FA_SEND_LIMIT = 5;       // 5 запросов на отправку 2FA-кода в Telegram в минуту с одного IP
export const AUTH_VERIFY_INN_CODE_LIMIT = 10; // 10 попыток проверки кода доступа по ИНН в минуту с одного IP
export const REQUEST_INN_ACCESS_LIMIT = 5;    // 5 запросов на отправку кода доступа по ИНН в минуту (email)

/** HAULZ калькулятор — платные вызовы 2GIS */
export const HAULZ_CALC_SUGGEST_LIMIT = 60;  // подсказки адреса в минуту с IP
export const HAULZ_CALC_QUOTE_LIMIT = 30;    // полных расчётов в минуту с IP
