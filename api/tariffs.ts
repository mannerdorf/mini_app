import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

/**
 * GET /api/tariffs
 * Список тарифов из кэша (для вкладки «Тарифы» в Документах и справочника в админке).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, code, name, value, unit, data, sort_order, fetched_at AS "fetchedAt"
       FROM cache_tariffs
       ORDER BY sort_order ASC, name ASC, id ASC`
    );
    return res.json({ tariffs: rows });
  } catch (e: any) {
    console.error("tariffs error:", e?.message || e);
    return res.status(500).json({ error: "Ошибка загрузки тарифов" });
  }
}
