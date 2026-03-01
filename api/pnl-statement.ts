import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) return res.status(400).json({ error: "Нужен период" });

    const period = `${year}-${String(month).padStart(2, "0")}-01`;
    const { rows } = await pool.query(
      `SELECT counterparty, total_amount AS "totalAmount",
              operations_count AS count, accounted
       FROM pnl_statement_expenses WHERE period = $1
       ORDER BY total_amount DESC`,
      [period]
    );
    return res.json({ byCounterparty: rows });
  }

  if (req.method === "PATCH") {
    const { month, year, counterparty, accounted } = req.body ?? {};
    const m = Number(month);
    const y = Number(year);
    if (!m || !y || !counterparty) return res.status(400).json({ error: "Нужен период и контрагент" });

    const period = `${y}-${String(m).padStart(2, "0")}-01`;
    await pool.query(
      `UPDATE pnl_statement_expenses SET accounted = $1, updated_at = now()
       WHERE period = $2 AND counterparty = $3`,
      [Boolean(accounted), period, String(counterparty)]
    );
    return res.json({ ok: true });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
