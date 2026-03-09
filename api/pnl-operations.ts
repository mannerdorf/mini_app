import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_operations");
  try {
    const pool = getPool();

    if (req.method === "GET") {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const direction = req.query.direction as string | undefined;

      const transportType = req.query.transportType as string | undefined;

      const conds: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (from) { conds.push(`date >= $${idx}`); params.push(from); idx++; }
      if (to) { conds.push(`date <= $${idx}`); params.push(to); idx++; }
      if (direction && direction !== "all") { conds.push(`direction = $${idx}`); params.push(direction); idx++; }
      if (transportType && transportType !== "all") { conds.push(`transport_type = $${idx}`); params.push(transportType); idx++; }

      const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
      const { rows } = await pool.query(
        `SELECT id, date, counterparty, purpose, amount,
                operation_type AS "operationType", department,
                logistics_stage AS "logisticsStage", direction,
                transport_type AS "transportType",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM pnl_operations${where} ORDER BY date DESC`,
        params
      );
      return res.json(rows);
    }

    if (req.method === "POST") {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, logistics_stage, direction, transport_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, date, counterparty, purpose, amount,
                   operation_type AS "operationType", department,
                   logistics_stage AS "logisticsStage", direction,
                   transport_type AS "transportType",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [new Date(b.date), b.counterparty, b.purpose, Number(b.amount), b.operationType, b.department, b.logisticsStage || null, b.direction || null, b.transportType || null]
      );
      return res.json(rows[0]);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "pnl_operations_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка операций P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
