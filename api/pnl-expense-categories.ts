import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_expense_categories");
  try {
    const pool = getPool();
    await pool.query("ALTER TABLE pnl_expense_categories ADD COLUMN IF NOT EXISTS expense_category_id text");
    const id = req.query.id as string | undefined;

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT id, name, department, type, logistics_stage AS "logisticsStage",
                sort_order AS "sortOrder", expense_category_id AS "expenseCategoryId", created_at AS "createdAt"
         FROM pnl_expense_categories ORDER BY department, sort_order, name`
      );
      return res.json(rows);
    }

    if (req.method === "POST") {
      const b = req.body;
      if (!b.department) return res.status(400).json({ error: "Укажите подразделение", request_id: ctx.requestId });

      let name: string;
      let expenseCategoryId: string | null = null;

      if (b.expenseCategoryId) {
        const { rows: ec } = await pool.query(
          `SELECT name FROM expense_categories WHERE id = $1`,
          [b.expenseCategoryId]
        );
        if (!ec?.length) return res.status(400).json({ error: "Статья расхода не найдена", request_id: ctx.requestId });
        name = ec[0].name;
        expenseCategoryId = b.expenseCategoryId;
        const { rows: exist } = await pool.query(
          `SELECT 1 FROM pnl_expense_categories WHERE expense_category_id = $1 AND department = $2 AND (logistics_stage IS NOT DISTINCT FROM $3)`,
          [b.expenseCategoryId, b.department, b.logisticsStage ?? null]
        );
        if (exist?.length) return res.status(400).json({ error: "Такая статья уже есть в этом подразделении", request_id: ctx.requestId });
      } else if (b.name?.trim()) {
        name = b.name.trim();
      } else {
        return res.status(400).json({ error: "Укажите статью расхода (expenseCategoryId или name)", request_id: ctx.requestId });
      }

      const { rows } = await pool.query(
        `INSERT INTO pnl_expense_categories (name, department, type, logistics_stage, sort_order, expense_category_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, department, type, logistics_stage AS "logisticsStage",
                   sort_order AS "sortOrder", expense_category_id AS "expenseCategoryId", created_at AS "createdAt"`,
        [name, b.department, b.type || "OPEX", b.logisticsStage ?? null, b.sortOrder ?? 0, expenseCategoryId]
      );
      return res.json(rows[0]);
    }

    if (req.method === "PATCH" && id) {
      const b = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (b.name != null) { sets.push(`name = $${idx}`); params.push(b.name); idx++; }
      if (b.department != null) { sets.push(`department = $${idx}`); params.push(b.department); idx++; }
      if (b.type != null) { sets.push(`type = $${idx}`); params.push(b.type); idx++; }
      if (b.logisticsStage !== undefined) { sets.push(`logistics_stage = $${idx}`); params.push(b.logisticsStage || null); idx++; }
      if (b.sortOrder != null) { sets.push(`sort_order = $${idx}`); params.push(b.sortOrder); idx++; }
      if (!sets.length) return res.json({});
      params.push(id);
      const { rows } = await pool.query(
        `UPDATE pnl_expense_categories SET ${sets.join(", ")} WHERE id = $${idx}
         RETURNING id, name, department, type, logistics_stage AS "logisticsStage",
                   sort_order AS "sortOrder", expense_category_id AS "expenseCategoryId", created_at AS "createdAt"`,
        params
      );
      return res.json(rows[0]);
    }

    if (req.method === "DELETE" && id) {
      await pool.query("DELETE FROM pnl_expense_categories WHERE id = $1", [id]);
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "pnl_expense_categories_failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || "Ошибка работы со справочником расходов", request_id: ctx.requestId });
  }
}
