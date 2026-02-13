import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";

/**
 * GET /api/admin-top-active?limit=10
 * Топ активных пользователей по последнему входу (last_login_at).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      login: string;
      company_name: string;
      last_login_at: string | null;
    }>(
      `SELECT id, login, company_name, last_login_at
       FROM registered_users
       WHERE active = true
       ORDER BY last_login_at DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return res.status(200).json({ users: rows });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-top-active error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
