import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

/**
 * GET /api/sverki
 * Список актов сверок из кэша (для вкладки «Акты сверок» в Документах и справочника в админке).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const pool = getPool();
    const inn = typeof req.query.inn === "string" ? req.query.inn.trim() : "";
    const hasInnFilter = inn.length > 0;
    const { rows } = await pool.query(
      `SELECT
         id,
         doc_number AS "docNumber",
         doc_date AS "docDate",
         period_from AS "periodFrom",
         period_to AS "periodTo",
         customer_name AS "customerName",
         customer_inn AS "customerInn",
         data,
         sort_order AS "sortOrder",
         fetched_at AS "fetchedAt"
       FROM cache_sverki
       WHERE ($1::text = '' OR customer_inn = $1::text)
       ORDER BY doc_date DESC NULLS LAST, doc_number DESC, id DESC`,
      [hasInnFilter ? inn : ""]
    );
    return res.json({ sverki: rows });
  } catch (e: any) {
    console.error("sverki error:", e?.message || e);
    return res.status(500).json({ error: "Ошибка загрузки актов сверок" });
  }
}
