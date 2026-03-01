import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const type = req.query.type as string | undefined;

    const conds: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (from) { conds.push(`date >= $${idx}`); params.push(from); idx++; }
    if (to) { conds.push(`date <= $${idx}`); params.push(to); idx++; }
    if (type && type !== "all") { conds.push(`type = $${idx}`); params.push(type); idx++; }

    const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT id, date, counterparty, purpose, amount, type,
              created_at AS "createdAt"
       FROM pnl_credit_payments${where} ORDER BY date DESC`,
      params
    );
    return res.json(rows);
  }

  if (req.method === "POST") {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO pnl_credit_payments (date, counterparty, purpose, amount, type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, date, counterparty, purpose, amount, type, created_at AS "createdAt"`,
      [new Date(b.date), b.counterparty, b.purpose || null, Number(b.amount), b.type === "LEASING" ? "LEASING" : "CREDIT"]
    );
    return res.json(rows[0]);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
