import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-audit-log");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || 100), 10) || 100));
  const action = typeof req.query.action === "string" ? req.query.action.trim() || null : null;
  const targetType = typeof req.query.target_type === "string" ? req.query.target_type.trim() || null : null;
  const from = typeof req.query.from === "string" ? req.query.from.trim() || null : null;
  const to = typeof req.query.to === "string" ? req.query.to.trim() || null : null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() || null : null;

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (action) {
    conditions.push(`action = $${idx}`);
    params.push(action);
    idx += 1;
  }
  if (targetType) {
    conditions.push(`target_type = $${idx}`);
    params.push(targetType);
    idx += 1;
  }
  if (from) {
    conditions.push(`created_at >= $${idx}::timestamptz`);
    params.push(from);
    idx += 1;
  }
  if (to) {
    conditions.push(`created_at <= $${idx}::timestamptz`);
    params.push(to + " 23:59:59.999");
    idx += 1;
  }
  if (q) {
    conditions.push(
      `(details->>'login' ILIKE $${idx} OR target_id ILIKE $${idx} OR action ILIKE $${idx} OR target_type ILIKE $${idx})`
    );
    params.push("%" + q.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%");
    idx += 1;
  }

  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  params.push(limit);

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      action: string;
      target_type: string;
      target_id: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT id, action, target_type, target_id, details, created_at
       FROM admin_audit_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params
    );
    return res.status(200).json({ entries: rows, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_audit_log_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки журнала", request_id: ctx.requestId });
  }
}
export default withErrorLog(handler);