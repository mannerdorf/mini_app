import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const direction = req.query.direction as string | undefined;

    const conds: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (from) { conds.push(`date >= $${idx}`); params.push(from); idx++; }
    if (to) { conds.push(`date <= $${idx}`); params.push(to); idx++; }
    if (direction && direction !== "all") { conds.push(`direction = $${idx}`); params.push(direction); idx++; }

    const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT id, date, counterparty, purpose, amount,
              operation_type AS "operationType", department,
              logistics_stage AS "logisticsStage", direction,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM pnl_operations${where} ORDER BY date DESC`,
      params
    );
    return res.json(rows);
  }

  if (req.method === "POST") {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, logistics_stage, direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, date, counterparty, purpose, amount,
                 operation_type AS "operationType", department,
                 logistics_stage AS "logisticsStage", direction,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [new Date(b.date), b.counterparty, b.purpose, Number(b.amount), b.operationType, b.department, b.logisticsStage || null, b.direction || null]
    );
    return res.json(rows[0]);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
