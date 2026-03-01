import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `SELECT id, counterparty, purpose_pattern AS "purposePattern",
              operation_type AS "operationType", department,
              logistics_stage AS "logisticsStage", direction,
              transport_type AS "transportType",
              created_at AS "createdAt"
       FROM pnl_classification_rules`
    );
    return res.json(rows);
  }

  if (req.method === "POST") {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pnl_classification_rules (counterparty, purpose_pattern, operation_type, department, logistics_stage, direction, transport_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (counterparty) DO UPDATE SET
         purpose_pattern = EXCLUDED.purpose_pattern,
         operation_type = EXCLUDED.operation_type,
         department = EXCLUDED.department,
         logistics_stage = EXCLUDED.logistics_stage,
         direction = EXCLUDED.direction,
         transport_type = EXCLUDED.transport_type
       RETURNING id, counterparty, purpose_pattern AS "purposePattern",
                 operation_type AS "operationType", department,
                 logistics_stage AS "logisticsStage", direction,
                 transport_type AS "transportType",
                 created_at AS "createdAt"`,
      [b.counterparty, b.purposePattern || null, b.operationType, b.department, b.logisticsStage || null, b.direction || null, b.transportType || null]
    );
    return res.json(rows[0]);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
