import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * POST /api/admin-refresh-customers-cache
 * Запускает обновление кэша заказчиков (cache_customers) — тот же процесс, что и крон каждые 15 мин.
 * Только суперадмин. Вызов может занять до нескольких минут.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-refresh-customers-cache");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина", request_id: ctx.requestId });
  }

  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Не настроен CRON_SECRET для вызова обновления кэша", request_id: ctx.requestId });
  }

  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (typeof req.headers.origin === "string" ? req.headers.origin : "") ||
        (typeof req.headers.referer === "string" ? new URL(req.headers.referer).origin : "");
  if (!base) {
    return res.status(500).json({ error: "Не удалось определить URL приложения", request_id: ctx.requestId });
  }

  const cronUrl = `${base}/api/cron/refresh-cache`;
  try {
    const cronRes = await fetch(cronUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!cronRes.ok) {
      const text = await cronRes.text();
      return res.status(cronRes.status === 401 ? 403 : 502).json({
        error: cronRes.status === 401 ? "Нет доступа к задаче обновления кэша" : "Ошибка обновления кэша",
        details: text.slice(0, 200),
        request_id: ctx.requestId,
      });
    }
    return res.status(200).json({ ok: true, message: "Справочник заказчиков обновлён", request_id: ctx.requestId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(ctx, "admin_refresh_customers_cache_failed", e, { message: msg });
    return res.status(500).json({ error: "Ошибка при вызове обновления кэша", details: msg, request_id: ctx.requestId });
  }
}
