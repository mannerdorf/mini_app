import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * Справочник статей расходов для заявок на расходы.
 * Берём из Справочника расходов (pnl_expense_categories), чтобы не терять статьи.
 * Включаем также expense_categories без записей в pnl (обратная совместимость).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "expense-request-categories");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `WITH from_catalog AS (
         SELECT DISTINCT ON (ec.id) ec.id, ec.name, ec.cost_type, ec.sort_order
         FROM pnl_expense_categories p
         JOIN expense_categories ec ON ec.id = p.expense_category_id
         WHERE ec.active = true
         ORDER BY ec.id, ec.sort_order, ec.name
       ),
       not_in_catalog AS (
         SELECT ec.id, ec.name, ec.cost_type, ec.sort_order
         FROM expense_categories ec
         WHERE ec.active = true
           AND NOT EXISTS (SELECT 1 FROM pnl_expense_categories p WHERE p.expense_category_id = ec.id)
       )
       SELECT id, name, cost_type AS "costType", sort_order AS "sortOrder"
       FROM (SELECT * FROM from_catalog UNION ALL SELECT * FROM not_in_catalog) u
       ORDER BY sort_order, name`
    );
    return res.json(rows);
  } catch (e) {
    logError(ctx, "expense_request_categories_failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || "Ошибка загрузки статей расходов", request_id: ctx.requestId });
  }
}
