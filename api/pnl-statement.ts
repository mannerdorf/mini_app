import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_statement");
  try {
    const pool = getPool();

    if (req.method === "GET") {
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!month || !year) return res.status(400).json({ error: "Нужен период", request_id: ctx.requestId });

      const period = `${year}-${String(month).padStart(2, "0")}-01`;
      const { rows } = await pool.query(
        `SELECT s.counterparty,
                s.total_amount AS "totalAmount",
                s.operations_count AS count,
                CASE
                  WHEN s.category_id IS NOT NULL THEN EXISTS (
                    SELECT 1
                    FROM pnl_manual_expenses m
                    WHERE m.period = s.period
                      AND m.category_id = s.category_id
                      AND abs(coalesce(m.amount, 0)) > 0
                  )
                  ELSE s.accounted
                END AS accounted
         FROM pnl_statement_expenses s
         WHERE s.period = $1
         ORDER BY total_amount DESC`,
        [period]
      );
      return res.json({ byCounterparty: rows });
    }

    if (req.method === "PATCH") {
      const { month, year, counterparty, accounted } = req.body ?? {};
      const m = Number(month);
      const y = Number(year);
      if (!m || !y || !counterparty) return res.status(400).json({ error: "Нужен период и контрагент", request_id: ctx.requestId });

      const period = `${y}-${String(m).padStart(2, "0")}-01`;
      await pool.query(
        `UPDATE pnl_statement_expenses SET accounted = $1, updated_at = now()
         WHERE period = $2 AND counterparty = $3`,
        [Boolean(accounted), period, String(counterparty)]
      );
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "pnl_statement_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка работы с выпиской P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
