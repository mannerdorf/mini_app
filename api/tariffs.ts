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
    const inn = typeof req.query.inn === "string" ? req.query.inn.trim() : "";
    const hasInnFilter = inn.length > 0;
    const { rows } = await pool.query(
      `SELECT
         id,
         doc_date AS "docDate",
         doc_number AS "docNumber",
         customer_name AS "customerName",
         customer_inn AS "customerInn",
         city_from AS "cityFrom",
         city_to AS "cityTo",
         transport_type AS "transportType",
         is_dangerous AS "isDangerous",
         is_vet AS "isVet",
         tariff,
         data,
         sort_order AS "sortOrder",
         fetched_at AS "fetchedAt"
       FROM cache_tariffs
       WHERE ($1::text = '' OR customer_inn = $1::text)
       ORDER BY doc_date DESC NULLS LAST, doc_number DESC, id DESC`,
      [hasInnFilter ? inn : ""]
    );
    return res.json({ tariffs: rows });
  } catch (e: any) {
    console.error("tariffs error:", e?.message || e);
    return res.status(500).json({ error: "Ошибка загрузки тарифов" });
  }
}
