import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";

/**
 * POST /api/admin-refresh-tariffs-cache
 * Принудительно запускает обновление cache_tariffs из 1С (GETTarifs).
 * Доступно только суперадмину.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = verifyAdminToken(token);
  if (!payload?.superAdmin) {
    return res.status(403).json({ error: "Только для суперадмина" });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.ADMIN_ORIGIN || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  const url = cronSecret ? `${base}/api/cron/refresh-tariffs-cache?secret=${encodeURIComponent(cronSecret)}` : `${base}/api/cron/refresh-tariffs-cache`;

  try {
    const r = await fetch(url, { method: "POST" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json(data);
    }
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Ошибка вызова обновления тарифов" });
  }
}
