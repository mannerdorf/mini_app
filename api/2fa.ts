import { getRedisValue, setRedisValue } from "./redis.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "2fa");
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(500).json({ error: "Redis not configured", request_id: ctx.requestId });
  }

  if (req.method === "GET") {
    const loginRaw = String((req.query as any)?.login || "").trim();
    const login = loginRaw.toLowerCase();
    if (!login) {
      return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
    }

    let raw = await getRedisValue(`2fa:login:${login}`);
    if (!raw && loginRaw && loginRaw !== login) {
      raw = await getRedisValue(`2fa:login:${loginRaw}`);
    }
    let stored: any = null;
    try {
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }

    const tgBind =
      (await getRedisValue(`tg:by_login:${login}`)) ||
      (loginRaw && loginRaw !== login ? await getRedisValue(`tg:by_login:${loginRaw}`) : null);
    let telegramLinkedFromDb = false;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{ exists: boolean }>(
        `select exists(
           select 1
           from telegram_chat_links
           where lower(trim(login)) = $1 and chat_status = 'active'
         ) as exists`,
        [login]
      );
      telegramLinkedFromDb = !!rows[0]?.exists;
    } catch (e: any) {
      if (e?.code !== "42P01") {
        logError(ctx, "2fa_tg_links_check_failed", e);
      }
    }
    const telegramLinked = !!tgBind || !!stored?.telegramLinked || telegramLinkedFromDb;

    const maxBind =
      (await getRedisValue(`max:by_login:${login}`)) ||
      (loginRaw && loginRaw !== login ? await getRedisValue(`max:by_login:${loginRaw}`) : null);
    const maxLinked = !!maxBind;

    const enabled = !!stored?.enabled;
    const method = stored?.method === "telegram" ? "telegram" : "google";

    const googleSecret =
      await getRedisValue(`2fa:google_secret:${login}`) ||
      (loginRaw && loginRaw !== login ? await getRedisValue(`2fa:google_secret:${loginRaw}`) : null);
    const googleSecretSet = !!googleSecret;

    return res.status(200).json({
      ok: true,
      settings: { enabled, method, telegramLinked, maxLinked, googleSecretSet },
      request_id: ctx.requestId,
    });
  }

  if (req.method === "POST") {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
      }
    }

    const loginRaw = String(body?.login || "").trim();
    const login = loginRaw.toLowerCase();
    if (!login) {
      return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
    }

    const enabled = !!body?.enabled;
    const method = body?.method === "telegram" ? "telegram" : "google";
    const telegramLinked = !!body?.telegramLinked;
    const payload = JSON.stringify({ enabled, method, telegramLinked });

    const saved = await setRedisValue(`2fa:login:${login}`, payload);
    const savedRaw = loginRaw && loginRaw !== login
      ? await setRedisValue(`2fa:login:${loginRaw}`, payload)
      : true;
    if (!saved || !savedRaw) {
      return res.status(500).json({ error: "Failed to save settings", request_id: ctx.requestId });
    }

    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}
