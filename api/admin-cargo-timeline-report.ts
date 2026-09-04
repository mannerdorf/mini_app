import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { buildCargoTimelineReport, parseCargoTimelineReportParams } from "../lib/cargoTimelineReportBuild.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-cargo-timeline-report");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token) || getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадминистратора", request_id: ctx.requestId });
  }

  let body: Record<string, unknown> = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const parsed = parseCargoTimelineReportParams(body);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error, request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const report = await buildCargoTimelineReport(pool, parsed);
    return res.status(200).json(report);
  } catch (e: unknown) {
    logError(ctx, "admin_cargo_timeline_report_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка формирования отчёта таймлайна",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);
