import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { insertUserAppEvent } from "../lib/userAppEvents.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { getClientIp, isRateLimited } from "../lib/rateLimit.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const BEACON_LIMIT_PER_MIN = 120;

function sanitizeSection(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "app-activity-beacon");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: { login?: string; password?: string; section?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const login = typeof body?.login === "string" ? body.login.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const section = sanitizeSection(body?.section);
  if (!login || !password || !section) {
    return res.status(400).json({ error: "Нужны login, password и section", request_id: ctx.requestId });
  }

  const ip = getClientIp(req);
  if (isRateLimited("app_activity_beacon", `${ip}:${login.toLowerCase()}`, BEACON_LIMIT_PER_MIN)) {
    return res.status(429).json({ error: "Слишком часто", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }

    const idRow = await pool.query<{ id: number }>(
      `SELECT id FROM registered_users WHERE lower(trim(login)) = lower(trim($1)) AND active = true LIMIT 1`,
      [login]
    );
    const userId = idRow.rows[0]?.id ?? null;

    await insertUserAppEvent(pool, {
      userId,
      login,
      eventType: "ui_section",
      meta: { section },
    });

    return res.status(204).end();
  } catch (e: unknown) {
    logError(ctx, "app_activity_beacon_failed", e);
    return res.status(500).json({ error: "Ошибка записи", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
