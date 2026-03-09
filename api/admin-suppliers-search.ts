import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * GET /api/admin-suppliers-search?q=...&limit=20
 * Поиск поставщиков в cache_suppliers (ИНН, наименование) для CMS.
 * Требует adminToken.
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-suppliers-search");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const requestedLimit = Math.max(5, parseInt(String(req.query.limit || 50), 10) || 50);
  const limit = !q || q.length < 2 ? Math.min(10000, requestedLimit) : Math.min(500, requestedLimit);

  try {
    const pool = getPool();
    if (!q || q.length < 2) {
      const { rows } = await pool.query<{ inn: string; supplier_name: string; email: string }>(
        "SELECT inn, supplier_name, email FROM cache_suppliers ORDER BY supplier_name LIMIT $1",
        [limit]
      );
      return res.status(200).json({ suppliers: rows, request_id: ctx.requestId });
    }

    const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const { rows } = await pool.query<{ inn: string; supplier_name: string; email: string }>(
      `SELECT inn, supplier_name, email FROM cache_suppliers
       WHERE inn ILIKE $1 OR supplier_name ILIKE $1 OR email ILIKE $1
       ORDER BY supplier_name LIMIT $2`,
      [pattern, limit]
    );
    return res.status(200).json({ suppliers: rows, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_suppliers_search_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка поиска", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
