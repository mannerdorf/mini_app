import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_summary_clear");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_summary"))) {
      return res.status(200).json({ ok: true, cleared: false, request_id: ctx.requestId });
    }

    await pool.query("truncate table wb_summary");

    await writeAuditLog(pool, {
      action: "wb_summary_clear",
      target_type: "wb_summary",
      target_id: null,
      details: { requestedBy: access.login },
    });

    return res.status(200).json({ ok: true, cleared: true, request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "wb_summary_clear_failed", error);
    return res.status(500).json({ error: "Ошибка очистки сводной", request_id: ctx.requestId });
  }
}
