import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";

/**
 * GET /api/admin-customers-search?q=...&limit=20
 * Поиск заказчиков в cache_customers (ИНН, наименование) для подстановки в поле ИНН в админке.
 * Требует adminToken.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const requestedLimit = Math.max(5, parseInt(String(req.query.limit || 50), 10) || 50);
  const limit = !q || q.length < 2
    ? Math.min(2000, requestedLimit)
    : Math.min(200, requestedLimit);

  try {
    const pool = getPool();
    if (!q || q.length < 2) {
      const { rows } = await pool.query<{ inn: string; customer_name: string; email: string }>(
        "SELECT inn, customer_name, email FROM cache_customers ORDER BY customer_name LIMIT $1",
        [limit]
      );
      return res.status(200).json({ customers: rows });
    }

    const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const { rows } = await pool.query<{ inn: string; customer_name: string; email: string }>(
      `SELECT inn, customer_name, email FROM cache_customers
       WHERE inn ILIKE $1 OR customer_name ILIKE $1 OR email ILIKE $1
       ORDER BY customer_name LIMIT $2`,
      [pattern, limit]
    );
    return res.status(200).json({ customers: rows });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-customers-search error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка поиска" });
  }
}
