import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_expense_categories_from_statement");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  const { counterparty, name, subdivisionId, type, month, year, saveExpense, amount, comment } = req.body;

  if (!counterparty?.trim()) return res.status(400).json({ error: "Укажите контрагента", request_id: ctx.requestId });

  const { rows: subs } = await pool.query(
    `SELECT id, department, logistics_stage FROM pnl_subdivisions WHERE id = $1 OR code = $1`,
    [subdivisionId]
  );
  const sub = subs[0];
  if (!sub) return res.status(400).json({ error: "Укажите подразделение", request_id: ctx.requestId });

  const nameStr = (name?.trim() || counterparty.trim());
  const expenseType = type === "COGS" || type === "OPEX" || type === "CAPEX" ? type : "OPEX";

  try {
    const { rows: catRows } = await pool.query(
      `INSERT INTO pnl_expense_categories (name, department, type, logistics_stage, sort_order)
       VALUES ($1, $2, $3, $4, 0)
       RETURNING id, name, department, type, logistics_stage AS "logisticsStage"`,
      [nameStr, sub.department, expenseType, sub.logistics_stage]
    );
    const category = catRows[0];

    await pool.query(
      `INSERT INTO pnl_classification_rules (counterparty, operation_type, department, logistics_stage)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (counterparty) DO UPDATE SET
         operation_type = EXCLUDED.operation_type,
         department = EXCLUDED.department,
         logistics_stage = EXCLUDED.logistics_stage`,
      [counterparty.trim(), expenseType, sub.department, sub.logistics_stage]
    );

    if (month && year) {
      const period = `${year}-${String(month).padStart(2, "0")}-01`;
      await pool.query(
        `UPDATE pnl_statement_expenses SET accounted = true, category_id = $1, updated_at = now()
         WHERE period = $2 AND counterparty = $3`,
        [category.id, period, counterparty.trim()]
      );

      const shouldSave = saveExpense !== false;
      const amt = Number(amount) || 0;
      if (shouldSave && amt !== 0) {
        const commentStr = comment?.trim() || null;
        await pool.query(
          `INSERT INTO pnl_manual_expenses (period, category_id, amount, comment, direction, transport_type)
           VALUES ($1, $2, $3, $4, '', '')
           ON CONFLICT (period, category_id, direction, transport_type)
           DO UPDATE SET amount = $3, comment = $4`,
          [period, category.id, amt, commentStr]
        );
      }
    }

    return res.json({ category, ok: true });
  } catch (e) {
    logError(ctx, "pnl_expense_categories_from_statement_failed", e);
    const msg = e instanceof Error ? e.message : "Ошибка сохранения";
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}
