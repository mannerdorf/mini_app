import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  const upper = source.toUpperCase();
  const known = new Set(["LOGISTICS_MSK", "LOGISTICS_KGD", "ADMINISTRATION", "DIRECTION", "IT", "SALES", "SERVICE", "GENERAL"]);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  const s = source.toLowerCase().replace(/ё/g, "е");
  if (s.includes("забор")) return { department: "LOGISTICS_MSK", logisticsStage: "PICKUP" };
  if (s.includes("склад москва") || s.includes("склад отправления")) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("магистрал")) return { department: "LOGISTICS_MSK", logisticsStage: "MAINLINE" };
  if (s.includes("склад калининград") || s.includes("склад получения")) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("последняя миля") || s.includes("last mile")) return { department: "LOGISTICS_KGD", logisticsStage: "LAST_MILE" };
  if (s.includes("администрац")) return { department: "ADMINISTRATION", logisticsStage: null };
  if (s.includes("дирекц")) return { department: "DIRECTION", logisticsStage: null };
  if (s.includes("продаж")) return { department: "SALES", logisticsStage: null };
  if (s.includes("сервис")) return { department: "SERVICE", logisticsStage: null };
  if (s === "it" || s.includes(" айти") || s.includes("it ")) return { department: "IT", logisticsStage: null };
  return { department: source || "GENERAL", logisticsStage: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool();

  if (req.method === "GET") {
    const month = req.query.month as string;
    const year = req.query.year as string;
    const department = req.query.department as string | undefined;
    const logisticsStage = req.query.logisticsStage as string | undefined;

    if (!month || !year) return res.status(400).json({ error: "month, year required" });
    const period = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
    const periodKey = `${year}-${String(Number(month)).padStart(2, "0")}`;

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

    const { rows: manualExpenses } = await pool.query(expenseQuery, params);

    const { rows: requestExpensesRaw } = await pool.query(
      `SELECT er.uid,
              er.category_id AS "categoryId",
              coalesce(ec.name, er.category_id) AS "categoryName",
              er.amount,
              er.comment,
              er.status,
              er.department,
              er.period,
              er.doc_date,
              er.approved_at,
              er.created_at
       FROM expense_requests er
       LEFT JOIN expense_categories ec ON ec.id = er.category_id
       WHERE er.status IN ('approved', 'paid')
         AND (
           er.period = $1
           OR to_char(coalesce(er.doc_date, er.approved_at::date, er.created_at::date), 'YYYY-MM') = $2
         )
       ORDER BY coalesce(er.doc_date, er.approved_at::date, er.created_at::date) DESC`,
      [periodKey, periodKey]
    );

    const requestExpenses = requestExpensesRaw
      .filter((e: any) => {
        const mapped = mapDepartmentToPnl(e.department);
        if (department != null && mapped.department !== department) return false;
        // Expense requests can be entered on broader department labels (e.g. "Склад Москва").
        // To avoid hiding approved/paid requests in the "Расходы" section, filter request rows
        // by department only and do not strictly pin them to a single logistics stage.
        return true;
      })
      .map((e: any) => ({
        id: `request:${e.uid}`,
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        amount: Number(e.amount) || 0,
        comment: e.comment ?? null,
        direction: "",
        transportType: "",
        source: "expense_request",
        requestStatus: e.status,
      }));

    const expenses = [
      ...manualExpenses.map((e: any) => ({
        id: `manual:${e.categoryId}:${e.direction ?? ""}:${e.transportType ?? ""}`,
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        amount: e.amount,
        comment: e.comment ?? null,
        direction: e.direction ?? "",
        transportType: e.transportType ?? "",
        source: "manual",
        requestStatus: null,
      })),
      ...requestExpenses,
    ];

    return res.json({
      revenues: revenues.map((r: any) => ({
        categoryId: r.categoryId,
        amount: r.amount,
        direction: r.direction ?? "",
        transportType: r.transportType ?? "",
      })),
      expenses,
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
