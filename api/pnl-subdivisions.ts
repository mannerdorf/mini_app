import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const DEFAULT_SUBDIVISIONS = [
  { code: "pickup_msk", name: "Заборная логистика Москва", department: "LOGISTICS_MSK", logistics_stage: "PICKUP", sort_order: 0 },
  { code: "warehouse_msk", name: "Склад Москва", department: "LOGISTICS_MSK", logistics_stage: "DEPARTURE_WAREHOUSE", sort_order: 1 },
  { code: "mainline", name: "Магистраль", department: "LOGISTICS_MSK", logistics_stage: "MAINLINE", sort_order: 2 },
  { code: "warehouse_kgd", name: "Склад Калининград", department: "LOGISTICS_KGD", logistics_stage: "ARRIVAL_WAREHOUSE", sort_order: 3 },
  { code: "lastmile_kgd", name: "Последняя миля Калининград", department: "LOGISTICS_KGD", logistics_stage: "LAST_MILE", sort_order: 4 },
  { code: "administration", name: "Администрация", department: "ADMINISTRATION", logistics_stage: null, sort_order: 5 },
  { code: "direction", name: "Дирекция", department: "DIRECTION", logistics_stage: null, sort_order: 6 },
  { code: "sales", name: "Отдел продаж", department: "SALES", logistics_stage: null, sort_order: 7 },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_subdivisions");
  try {
    const pool = getPool();
    const id = req.query.id as string | undefined;

    if (req.method === "GET") {
      for (const s of DEFAULT_SUBDIVISIONS) {
        await pool.query(
          `INSERT INTO pnl_subdivisions (code, name, department, logistics_stage, sort_order)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING`,
          [s.code, s.name, s.department, s.logistics_stage, s.sort_order]
        );
      }
      const { rows } = await pool.query(
        `SELECT id, code, name, department, logistics_stage AS "logisticsStage",
                sort_order AS "sortOrder", created_at AS "createdAt"
         FROM pnl_subdivisions ORDER BY sort_order, name`
      );
      return res.json(rows);
    }

    if (req.method === "POST") {
      const b = req.body;
      if (!b.name?.trim()) return res.status(400).json({ error: "Название обязательно", request_id: ctx.requestId });
      const code = b.code?.trim() || b.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9а-яё_]/gi, "").replace(/_+/g, "_") || "sub";
      const { rows } = await pool.query(
        `INSERT INTO pnl_subdivisions (code, name, department, logistics_stage, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name, department, logistics_stage AS "logisticsStage",
                   sort_order AS "sortOrder", created_at AS "createdAt"`,
        [code || null, b.name.trim(), b.department || "ADMINISTRATION", b.logisticsStage ?? null, b.sortOrder ?? 0]
      );
      return res.json(rows[0]);
    }

    if (req.method === "PATCH" && id) {
      const b = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (b.code !== undefined) { sets.push(`code = $${idx}`); params.push(b.code?.trim() || null); idx++; }
      if (b.name != null) { sets.push(`name = $${idx}`); params.push(b.name); idx++; }
      if (b.department != null) { sets.push(`department = $${idx}`); params.push(b.department); idx++; }
      if (b.logisticsStage !== undefined) { sets.push(`logistics_stage = $${idx}`); params.push(b.logisticsStage || null); idx++; }
      if (b.sortOrder != null) { sets.push(`sort_order = $${idx}`); params.push(b.sortOrder); idx++; }
      if (!sets.length) return res.json({});
      params.push(id);
      const { rows } = await pool.query(
        `UPDATE pnl_subdivisions SET ${sets.join(", ")} WHERE id = $${idx}
         RETURNING id, code, name, department, logistics_stage AS "logisticsStage",
                   sort_order AS "sortOrder", created_at AS "createdAt"`,
        params
      );
      return res.json(rows[0]);
    }

    if (req.method === "DELETE" && id) {
      await pool.query("DELETE FROM pnl_subdivisions WHERE id = $1", [id]);
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "pnl_subdivisions_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка справочника подразделений P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
