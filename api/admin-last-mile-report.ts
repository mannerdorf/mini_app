import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { readNormalizedByDateRange } from "../lib/documentCacheNormalized.js";
import { buildLastMileVehicleReport } from "../lib/lastMileVehicleReport.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-last-mile-report");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token) || getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадминистратора", request_id: ctx.requestId });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const dateFrom = String(body.dateFrom ?? "").trim();
  const dateTo = String(body.dateTo ?? "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Укажите dateFrom и dateTo в формате YYYY-MM-DD", request_id: ctx.requestId });
  }
  if (dateFrom > dateTo) {
    return res.status(400).json({ error: "dateFrom не может быть позже dateTo", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const payloads = await readNormalizedByDateRange(pool, "perevozki", dateFrom, dateTo, { dateField: "vr" });
    const items = payloads.map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}));
    const report = buildLastMileVehicleReport(items, dateFrom, dateTo);
    return res.status(200).json(report);
  } catch (e: unknown) {
    logError(ctx, "admin-last-mile-report failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка формирования отчёта последней мили",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);
