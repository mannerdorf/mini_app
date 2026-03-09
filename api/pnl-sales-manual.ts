import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_sales_manual");
  const pool = getPool();

  if (req.method === "GET") {
    const month = req.query.month as string;
    const year = req.query.year as string;
    if (!month || !year) return res.status(400).json({ error: "month, year required", request_id: ctx.requestId });

    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toISOString();

    const { rows: cats } = await pool.query(
      `SELECT id, name, direction, transport_type AS "transportType"
       FROM pnl_income_categories
       WHERE direction IN ('MSK_TO_KGD','KGD_TO_MSK') AND transport_type IN ('AUTO','FERRY')
       ORDER BY direction, transport_type, sort_order, name`
    );

    const seen = new Set<string>();
    const templateRows: { direction: string; transportType: string; categoryId: string; name: string }[] = [];
    for (const c of cats) {
      const key = `${c.direction}:${c.transportType}`;
      if (!seen.has(key)) {
        seen.add(key);
        templateRows.push({ direction: c.direction, transportType: c.transportType, categoryId: c.id, name: c.name });
      }
    }

    const { rows: sales } = await pool.query(
      `SELECT direction, transport_type AS "transportType",
              weight_kg AS "weightKg", volume, paid_weight_kg AS "paidWeightKg", revenue
       FROM pnl_sales WHERE date = $1
       ORDER BY direction, transport_type`,
      [date]
    );

    const byKey: Record<string, { weightKg: number; volume: number; paidWeightKg: number; revenue: number }> = {};
    for (const r of templateRows) {
      byKey[`${r.direction}:${r.transportType}`] = { weightKg: 0, volume: 0, paidWeightKg: 0, revenue: 0 };
    }
    for (const s of sales) {
      const key = `${s.direction}:${s.transportType ?? "AUTO"}`;
      if (byKey[key]) {
        byKey[key] = { weightKg: s.weightKg, volume: s.volume ?? 0, paidWeightKg: s.paidWeightKg ?? 0, revenue: s.revenue };
      }
    }

    return res.json({
      rows: templateRows.map((r) => ({
        ...r,
        ...byKey[`${r.direction}:${r.transportType}`],
      })),
    });
  }

  if (req.method === "POST") {
    const { month, year, rows } = req.body;
    if (!month || !year || !Array.isArray(rows)) return res.status(400).json({ error: "month, year, rows required", request_id: ctx.requestId });

    const date = new Date(Number(year), Number(month) - 1, 1).toISOString();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM pnl_sales WHERE date = $1", [date]);
      await client.query(
        `DELETE FROM pnl_operations WHERE date = $1 AND operation_type = 'REVENUE' AND purpose LIKE 'Продажи %'`,
        [date]
      );

      for (const r of rows) {
        const direction = r.direction === "KGD_TO_MSK" ? "KGD_TO_MSK" : "MSK_TO_KGD";
        const transportType = r.transportType === "FERRY" ? "FERRY" : "AUTO";
        const weightKg = parseFloat(String(r.weightKg ?? "")) || 0;
        const volume = parseFloat(String(r.volume ?? "")) || 0;
        const paidWeightKg = parseFloat(String(r.paidWeightKg ?? "")) || 0;
        const revenue = parseFloat(String(r.revenue ?? "")) || 0;

        await client.query(
          `INSERT INTO pnl_sales (date, client, direction, transport_type, weight_kg, volume, paid_weight_kg, revenue)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [date, "—", direction, transportType, weightKg, volume || null, paidWeightKg || null, revenue]
        );

        if (revenue > 0) {
          const purpose = direction === "MSK_TO_KGD" ? "Продажи МСК→КГД" : "Продажи КГД→МСК";
          const dept = direction === "MSK_TO_KGD" ? "LOGISTICS_MSK" : "LOGISTICS_KGD";
          await client.query(
            `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, direction, transport_type)
             VALUES ($1, $2, $3, $4, 'REVENUE', $5, $6, $7)`,
            [date, "—", `${purpose} (${transportType === "FERRY" ? "паром" : "авто"})`, revenue, dept, direction, transportType]
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      logError(ctx, "pnl_sales_manual_save_failed", err);
      const msg = err instanceof Error ? err.message : "Ошибка сохранения";
      return res.status(500).json({ error: msg, request_id: ctx.requestId });
    } finally {
      client.release();
    }

    return res.json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}
