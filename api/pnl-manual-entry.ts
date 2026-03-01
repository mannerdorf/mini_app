import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

function normalizeName(raw?: string | null): string {
  return String(raw ?? "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

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
                               m.transport_type AS "transportType",
                               c.type AS "type",
                               c.department AS "department",
                               c.logistics_stage AS "logisticsStage"
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

    let requestExpensesRaw: any[] = [];
    try {
      const result = await pool.query(
        `SELECT er.uid,
                er.category_id AS "categoryId",
                coalesce(ec.name, er.category_id) AS "categoryName",
                er.amount,
                er.comment,
                er.status,
                er.department,
                ec.cost_type AS "requestCostType",
                er.period,
                er.doc_date,
                er.created_at
         FROM expense_requests er
         LEFT JOIN expense_categories ec ON ec.id = er.category_id
         WHERE er.status IN ('approved', 'paid')
           AND (
             er.period = $1
             OR to_char(coalesce(er.doc_date, er.created_at::date), 'YYYY-MM') = $2
           )
         ORDER BY coalesce(er.doc_date, er.created_at::date) DESC`,
        [periodKey, periodKey]
      );
      requestExpensesRaw = result.rows;
    } catch (e) {
      console.error("pnl-manual-entry expense_requests read failed:", e);
      requestExpensesRaw = [];
    }

    const requestCategoryIds = [...new Set(
      requestExpensesRaw
        .map((e: any) => String(e?.categoryId ?? "").trim())
        .filter(Boolean)
    )];
    const requestCategoryNames = [...new Set(
      requestExpensesRaw
        .map((e: any) => normalizeName(e?.categoryName))
        .filter(Boolean)
    )];
    let pnlTypeMap = new Map<string, string>();
    let pnlTypeByNameMap = new Map<string, string>();
    if (requestCategoryIds.length > 0 || requestCategoryNames.length > 0) {
      try {
        const { rows: typeRows } = await pool.query(
          `SELECT expense_category_id AS "expenseCategoryId",
                  name,
                  department,
                  logistics_stage AS "logisticsStage",
                  type
           FROM pnl_expense_categories
           WHERE ($1::text[] <> '{}'::text[] AND expense_category_id = ANY($1::text[]))
              OR ($2::text[] <> '{}'::text[] AND lower(trim(name)) = ANY($2::text[]))`,
          [requestCategoryIds, requestCategoryNames]
        );
        pnlTypeMap = new Map<string, string>(
          typeRows.map((r: any) => [
            `${String(r.expenseCategoryId ?? "")}::${String(r.department ?? "")}::${String(r.logisticsStage ?? "")}`,
            String(r.type ?? "").trim().toUpperCase(),
          ])
        );
        pnlTypeByNameMap = new Map<string, string>(
          typeRows.map((r: any) => [
            `${normalizeName(r.name)}::${String(r.department ?? "")}::${String(r.logisticsStage ?? "")}`,
            String(r.type ?? "").trim().toUpperCase(),
          ])
        );
      } catch (e) {
        console.error("pnl-manual-entry pnl_expense_categories type map read failed:", e);
      }
    }

    let requestExpenses = requestExpensesRaw
      .filter((e: any) => {
        const mapped = mapDepartmentToPnl(e.department);
        if (department != null && mapped.department !== department) return false;
        // Expense requests can be entered on broader department labels (e.g. "Склад Москва").
        // To avoid hiding approved/paid requests in the "Расходы" section, filter request rows
        // by department only and do not strictly pin them to a single logistics stage.
        return true;
      })
      .map((e: any) => {
        // For requests, type priority is:
        // 1) PnL category for mapped department+stage, 2) department without stage, 3) request category cost_type, 4) OPEX.
        const mapped = mapDepartmentToPnl(e.department);
        const categoryId = String(e.categoryId ?? "").trim();
        const exactKey = `${categoryId}::${mapped.department}::${String(mapped.logisticsStage ?? "")}`;
        const depOnlyKey = `${categoryId}::${mapped.department}::`;
        const categoryName = normalizeName(e.categoryName);
        const exactNameKey = `${categoryName}::${mapped.department}::${String(mapped.logisticsStage ?? "")}`;
        const depOnlyNameKey = `${categoryName}::${mapped.department}::`;
        const resolvedType =
          pnlTypeMap.get(exactKey) ||
          pnlTypeMap.get(depOnlyKey) ||
          pnlTypeByNameMap.get(exactNameKey) ||
          pnlTypeByNameMap.get(depOnlyNameKey) ||
          String(e.requestCostType ?? "").trim().toUpperCase() ||
          "OPEX";
        return {
          id: `request:${e.uid}`,
          categoryId: e.categoryId,
          categoryName: e.categoryName,
          amount: Number(e.amount) || 0,
          comment: e.comment ?? null,
          direction: "",
          transportType: "",
          type: resolvedType,
          department: mapped.department,
          logisticsStage: mapped.logisticsStage,
          requestDepartment: String(e.department ?? "").trim() || null,
          source: "expense_request",
          requestStatus: e.status,
        };
      });

    let salaryExpenses: any[] = [];
    try {
      const { rows: salaryTypeRows } = await pool.query(
        `SELECT department,
                logistics_stage AS "logisticsStage",
                type,
                name
         FROM pnl_expense_categories
         WHERE lower(trim(name)) LIKE 'зарплат%'`
      );
      const salaryTypeMap = new Map<string, string>(
        salaryTypeRows.map((r: any) => [
          `${String(r.department ?? "")}::${String(r.logisticsStage ?? "")}`,
          String(r.type ?? "").trim().toUpperCase() || "OPEX",
        ])
      );
      const resolveSalaryType = (dep: string, stage: string | null): string => {
        const exact = `${dep}::${String(stage ?? "")}`;
        const depOnly = `${dep}::`;
        return salaryTypeMap.get(exact) || salaryTypeMap.get(depOnly) || "OPEX";
      };

      const { rows: payoutRows } = await pool.query(
        `SELECT p.id,
                p.amount,
                ru.department AS "employeeDepartment"
         FROM employee_timesheet_payouts p
         JOIN registered_users ru ON ru.id = p.employee_id
         WHERE p.period_month = $1::date`,
        [period]
      );

      const grouped = new Map<string, { amount: number; count: number; department: string; logisticsStage: string | null }>();
      payoutRows.forEach((r: any) => {
        const amountAbs = Math.abs(Number(r.amount) || 0);
        if (!(amountAbs > 0)) return;
        const mapped = mapDepartmentToPnl(r.employeeDepartment);
        if (department != null && mapped.department !== department) return;
        if (logisticsStage === "" || logisticsStage === "null") {
          if (mapped.logisticsStage != null) return;
        } else if (logisticsStage && mapped.logisticsStage !== logisticsStage) {
          return;
        }
        const key = `${mapped.department}::${String(mapped.logisticsStage ?? "")}`;
        const prev = grouped.get(key) || { amount: 0, count: 0, department: mapped.department, logisticsStage: mapped.logisticsStage };
        prev.amount += amountAbs;
        prev.count += 1;
        grouped.set(key, prev);
      });

      salaryExpenses = Array.from(grouped.values()).map((g) => ({
        id: `timesheet-salary:${periodKey}:${g.department}:${String(g.logisticsStage ?? "none")}`,
        categoryId: `timesheet-salary:${g.department}:${String(g.logisticsStage ?? "none")}`,
        categoryName: "Зарплата",
        amount: g.amount,
        comment: `По табелю (${g.count} выплат)`,
        direction: "",
        transportType: "",
        type: resolveSalaryType(g.department, g.logisticsStage),
        department: g.department,
        logisticsStage: g.logisticsStage,
        source: "timesheet_salary",
        requestStatus: null,
      }));
    } catch (e) {
      console.error("pnl-manual-entry timesheet salary read failed:", e);
      salaryExpenses = [];
    }

    // Fallback for legacy/partially synced data: include approved request operations from pnl_operations.
    if (requestExpenses.length === 0 && department != null) {
      let requestOpsRows: any[] = [];
      try {
        const result = await pool.query(
          `SELECT id,
                  purpose,
                  amount,
                  operation_type,
                  department
           FROM pnl_operations
           WHERE date_trunc('month', date) = $1::date
             AND purpose ILIKE 'Согласование заявки %'
             AND operation_type IN ('COGS', 'OPEX', 'CAPEX')
           ORDER BY date DESC`,
          [period]
        );
        requestOpsRows = result.rows.filter((r: any) => {
          const mapped = mapDepartmentToPnl(r.department);
          return mapped.department === department;
        });
      } catch (e) {
        console.error("pnl-manual-entry fallback pnl_operations read failed:", e);
        requestOpsRows = [];
      }
      requestExpenses = requestOpsRows.map((r: any) => {
        const purpose = String(r.purpose ?? "").trim();
        const nameFromPurpose = (() => {
          const m = purpose.match(/\(([^)]+)\)\s*$/);
          if (m && m[1]) return m[1].trim();
          return "Заявка на расходы";
        })();
        return {
          id: `op:${String(r.id)}`,
          categoryId: `from-op:${String(r.id)}`,
          categoryName: nameFromPurpose,
          amount: Math.abs(Number(r.amount) || 0),
          comment: purpose || null,
          direction: "",
          transportType: "",
          type: String(r.operation_type || "OPEX"),
          department: mapDepartmentToPnl(r.department).department,
          logisticsStage: mapDepartmentToPnl(r.department).logisticsStage,
          requestDepartment: String(r.department ?? "").trim() || null,
          source: "expense_request",
          requestStatus: "approved",
        };
      });
    }

    const expenses = [
      ...manualExpenses.map((e: any) => ({
        id: `manual:${e.categoryId}:${e.direction ?? ""}:${e.transportType ?? ""}`,
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        amount: e.amount,
        comment: e.comment ?? null,
        direction: e.direction ?? "",
        transportType: e.transportType ?? "",
        type: e.type ?? "OPEX",
        department: e.department ?? null,
        logisticsStage: e.logisticsStage ?? null,
        source: "manual",
        requestStatus: null,
      })),
      ...salaryExpenses,
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
        const requestId = String(e.requestId ?? "").trim();
        if (requestId) {
          const deleteRequest = Boolean(e.deleteRequest);
          if (deleteRequest) {
            await client.query(`DELETE FROM expense_requests WHERE uid = $1`, [requestId]);
            continue;
          }
          const amount = parseFloat(e.amount) || 0;
          const comment = (e.comment ?? "").trim() || null;
          await client.query(
            `UPDATE expense_requests
             SET amount = $2, comment = $3, updated_at = now()
             WHERE uid = $1`,
            [requestId, amount, comment]
          );
          continue;
        }

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
