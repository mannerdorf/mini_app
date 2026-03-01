import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const month = req.query.month as string;
    const year = req.query.year as string;
    const department = req.query.department as string | undefined;
    const logisticsStage = req.query.logisticsStage as string | undefined;

    if (!month || !year) return res.status(400).json({ error: "month, year required" });
    const period = `${year}-${String(Number(month)).padStart(2, "0")}-01`;

    const { rows: revenues } = await pool.query(
      `SELECT category_id AS "categoryId", amount,
              direction, transport_type AS "transportType"
       FROM pnl_manual_revenues WHERE period = $1`,
      [period]
    );

    let expenseQuery = `SELECT m.category_id AS "categoryId", c.name AS "categoryName",
                               m.amount, m.comment, m.direction,
                               m.transport_type AS "transportType"
                        FROM pnl_manual_expenses m
                        JOIN pnl_expense_categories c ON c.id = m.category_id
                        WHERE m.period = $1`;
    const params: unknown[] = [period];
    let idx = 2;

    if (department != null) {
      expenseQuery += ` AND c.department = $${idx}`;
      params.push(department);
      idx++;
      if (logisticsStage === "" || logisticsStage === "null") {
        expenseQuery += " AND c.logistics_stage IS NULL";
      } else if (logisticsStage) {
        expenseQuery += ` AND c.logistics_stage = $${idx}`;
        params.push(logisticsStage);
        idx++;
      }
    }

    const { rows: expenses } = await pool.query(expenseQuery, params);

    return res.json({
      revenues: revenues.map((r: any) => ({
        categoryId: r.categoryId,
        amount: r.amount,
        direction: r.direction ?? "",
        transportType: r.transportType ?? "",
      })),
      expenses: expenses.map((e: any) => ({
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        amount: e.amount,
        comment: e.comment ?? null,
        direction: e.direction ?? "",
        transportType: e.transportType ?? "",
      })),
    });
  }

  if (req.method === "POST") {
    const { period, revenues, expenses } = req.body;
    if (!period) return res.status(400).json({ error: "period required" });

    const periodDate = new Date(period).toISOString();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const r of revenues || []) {
        if (!r.categoryId) continue;
        const amount = parseFloat(r.amount) || 0;
        const direction = (r.direction ?? "").trim() || "";
        const transportType = (r.transportType ?? "").trim() || "";

        if (amount === 0) {
          await client.query(
            `DELETE FROM pnl_manual_revenues WHERE period = $1 AND category_id = $2 AND direction = $3 AND transport_type = $4`,
            [periodDate, r.categoryId, direction, transportType]
          );
        } else {
          await client.query(
            `INSERT INTO pnl_manual_revenues (period, category_id, amount, direction, transport_type)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (period, category_id, direction, transport_type)
             DO UPDATE SET amount = $3`,
            [periodDate, r.categoryId, amount, direction, transportType]
          );
        }
      }

      for (const e of expenses || []) {
        if (!e.categoryId) continue;
        const amount = parseFloat(e.amount) || 0;
        const comment = (e.comment ?? "").trim() || null;
        const direction = (e.direction ?? "").trim() || "";
        const transportType = (e.transportType ?? "").trim() || "";

        if (amount === 0) {
          await client.query(
            `DELETE FROM pnl_manual_expenses WHERE period = $1 AND category_id = $2 AND direction = $3 AND transport_type = $4`,
            [periodDate, e.categoryId, direction, transportType]
          );
        } else {
          await client.query(
            `INSERT INTO pnl_manual_expenses (period, category_id, amount, comment, direction, transport_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (period, category_id, direction, transport_type)
             DO UPDATE SET amount = $3, comment = $4`,
            [periodDate, e.categoryId, amount, comment, direction, transportType]
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return res.json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
