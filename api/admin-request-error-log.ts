import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || 100), 10) || 100));
  const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() || null : null;
  const from = typeof req.query.from === "string" ? req.query.from.trim() || null : null;
  const to = typeof req.query.to === "string" ? req.query.to.trim() || null : null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() || null : null;

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (statusFilter) {
    const statusNum = parseInt(statusFilter, 10);
    if (!isNaN(statusNum) && statusNum >= 400) {
      conditions.push(`status_code = $${idx}`);
      params.push(statusNum);
      idx += 1;
    }
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
      `(path ILIKE $${idx} OR error_message ILIKE $${idx} OR details::text ILIKE $${idx})`
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
      path: string;
      method: string;
      status_code: number;
      error_message: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT id, path, method, status_code, error_message, details, created_at
       FROM request_error_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params
    );
    return res.status(200).json({ entries: rows });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-request-error-log error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки журнала" });
  }
}

export default withErrorLog(handler);
