import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

/** Справочник статей расходов для заявок на расходы (единый с PNL). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, cost_type AS "costType", sort_order AS "sortOrder"
     FROM expense_categories
     WHERE active = true
     ORDER BY sort_order, name`
  );
  return res.json(rows);
}
