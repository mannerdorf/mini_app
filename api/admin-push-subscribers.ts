import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { loadAdminPushSubscribers } from "../lib/adminPushSubscribers.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-push-subscribers");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const subscribers = await loadAdminPushSubscribers(pool);
    const companyInns = new Set<string>();
    let devices = 0;
    for (const row of subscribers) {
      devices += row.deviceCount;
      for (const company of row.pushCompanies) companyInns.add(company.inn);
    }
    return res.status(200).json({
      ok: true,
      users: subscribers.length,
      devices,
      companies: companyInns.size,
      subscribers,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(200).json({
        ok: true,
        users: 0,
        devices: 0,
        companies: 0,
        subscribers: [],
        request_id: ctx.requestId,
      });
    }
    logError(ctx, "admin_push_subscribers_failed", err);
    return res.status(500).json({ error: err.message || "Ошибка загрузки подписчиков", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
