import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_income_categories");
  try {
    const pool = getPool();
    const id = req.query.id as string | undefined;

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT id, name, direction, transport_type AS "transportType",
                sort_order AS "sortOrder", created_at AS "createdAt"
         FROM pnl_income_categories ORDER BY sort_order, name`
      );
      return res.json(rows);
    }

    if (req.method === "POST") {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO pnl_income_categories (name, direction, transport_type, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, direction, transport_type AS "transportType",
                   sort_order AS "sortOrder", created_at AS "createdAt"`,
        [b.name, b.direction || "MSK_TO_KGD", b.transportType ?? "", b.sortOrder ?? 0]
      );
      return res.json(rows[0]);
    }

    if (req.method === "PATCH" && id) {
      const b = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (b.name != null) { sets.push(`name = $${idx}`); params.push(b.name); idx++; }
      if (b.direction != null) { sets.push(`direction = $${idx}`); params.push(b.direction); idx++; }
      if (b.transportType != null) { sets.push(`transport_type = $${idx}`); params.push(b.transportType); idx++; }
      if (b.sortOrder != null) { sets.push(`sort_order = $${idx}`); params.push(b.sortOrder); idx++; }
      if (!sets.length) return res.json({});
      params.push(id);
      const { rows } = await pool.query(
        `UPDATE pnl_income_categories SET ${sets.join(", ")} WHERE id = $${idx}
         RETURNING id, name, direction, transport_type AS "transportType",
                   sort_order AS "sortOrder", created_at AS "createdAt"`,
        params
      );
      return res.json(rows[0]);
    }

    if (req.method === "DELETE" && id) {
      await pool.query("DELETE FROM pnl_income_categories WHERE id = $1", [id]);
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "pnl_income_categories_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка справочника доходов P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
