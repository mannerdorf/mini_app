import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

/**
 * POST /api/admin-refresh-suppliers-cache
 * Принудительно запускает обновление cache_suppliers из 1С (GETALLKontragents).
 * Доступно только суперадмину.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина" });
  }

  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Не настроен CRON_SECRET для вызова обновления кэша" });
  }

  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (typeof req.headers.origin === "string" ? req.headers.origin : "") ||
        (() => {
          try {
            return typeof req.headers.referer === "string" ? new URL(req.headers.referer).origin : "";
          } catch {
            return "";
          }
        })();

  if (!base) {
    return res.status(500).json({ error: "Не удалось определить URL приложения" });
  }

  try {
    const cronRes = await fetch(`${base}/api/cron/refresh-suppliers-cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });

    const data = await cronRes.json().catch(() => ({}));
    if (!cronRes.ok) {
      const details = typeof data?.details === "string" ? data.details : "";
      const message = typeof data?.error === "string" ? data.error : "Ошибка обновления справочника поставщиков";
      return res.status(cronRes.status === 401 ? 403 : 502).json({
        error: cronRes.status === 401 ? "Нет доступа к задаче обновления кэша" : message,
        details: details.slice(0, 300),
      });
    }

    return res.status(200).json({
      ok: true,
      suppliers_count: Number(data?.suppliers_count || 0),
      refreshed_at: data?.refreshed_at || new Date().toISOString(),
      message: "Справочник поставщиков обновлён",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-refresh-suppliers-cache:", msg);
    return res.status(500).json({ error: "Ошибка при вызове обновления кэша", details: msg });
  }
}

