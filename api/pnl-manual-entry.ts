import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function normalizeName(raw?: string | null): string {
  return String(raw ?? "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  const upper = source.toUpperCase();
  const known = new Set(["LOGISTICS_MSK", "LOGISTICS_KGD", "ADMINISTRATION", "DIRECTION", "IT", "SALES", "SERVICE", "GENERAL"]);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  // Нормализация: ё->е, множественные пробелы в один, lowercase
  const s = source.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  // Заборная логистика Москва
  if (s.includes("забор")) return { department: "LOGISTICS_MSK", logisticsStage: "PICKUP" };
  // Склад Москва — поддерживаем варианты: "склад москва", "склад мск", "москва склад", "склад отправления"
  const hasMsk = s.includes("москва") || s.includes("мск");
  const hasKgd = s.includes("калининград") || s.includes("кгд");
  if (s.includes("склад") && hasMsk && !hasKgd) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("склад отправления")) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("магистрал")) return { department: "LOGISTICS_MSK", logisticsStage: "MAINLINE" };
  // Склад Калининград
  if (s.includes("склад") && hasKgd) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("склад получения")) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  // Последняя миля Калининград
  if (s.includes("последняя миля") || s.includes("last mile") || (s.includes("миля") && hasKgd)) return { department: "LOGISTICS_KGD", logisticsStage: "LAST_MILE" };
  // Администрация / Управляющая компания
  if (s.includes("администрац") || s.includes("управляющ")) return { department: "ADMINISTRATION", logisticsStage: null };
  if (s.includes("дирекц")) return { department: "DIRECTION", logisticsStage: null };
  if (s.includes("продаж")) return { department: "SALES", logisticsStage: null };
  if (s.includes("сервис")) return { department: "SERVICE", logisticsStage: null };
  if (s === "it" || s.includes(" айти") || s.includes("it ")) return { department: "IT", logisticsStage: null };
  return { department: source || "GENERAL", logisticsStage: null };
}

function mapPrimaryDepartmentCandidate(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  if (!source) return { department: "GENERAL", logisticsStage: null };
  const primary = source.split(",").map((x) => x.trim()).find(Boolean) || source;
  return mapDepartmentToPnl(primary);
}

function normalizeAccrualType(value: unknown): "hour" | "shift" | "month" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  if (raw.includes("month") || raw.includes("месяц")) return "month";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeShiftMark(rawValue: string): "Я" | "ПР" | "Б" | "В" | "ОГ" | "ОТ" | "УВ" | "" {
  const raw = String(rawValue || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "Я" || raw === "ПР" || raw === "Б" || raw === "В" || raw === "ОГ" || raw === "ОТ" || raw === "УВ") return raw as any;
  if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
  if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
  return "";
}

function parseHoursValue(rawValue: string): number {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
  }
  const parsed = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_manual_entry");
  const pool = getPool();

  if (req.method === "GET") {
    const month = req.query.month as string;
    const year = req.query.year as string;
    const department = req.query.department as string | undefined;
    const logisticsStage = req.query.logisticsStage as string | undefined;

    if (!month || !year) return res.status(400).json({ error: "month, year required", request_id: ctx.requestId });
    const period = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
    const periodKey = `${year}-${String(Number(month)).padStart(2, "0")}`;
    const nextPeriod = (() => {
      const y = Number(year);
      const m = Number(month);
      const d = new Date(y, m, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();

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
                er.doc_number AS "docNumber",
                er.vat_rate AS "vatRate",
                er.employee_name AS "employeeName",
                er.vehicle_text AS "vehicleText",
                er.supplier_name AS "supplierName",
                er.supplier_inn AS "supplierInn",
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
      logError(ctx, "pnl_manual_entry_expense_requests_read_failed", e);
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
        logError(ctx, "pnl_manual_entry_type_map_read_failed", e);
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
          docNumber: String(e.docNumber ?? "").trim() || null,
          docDate: e.doc_date ? String(e.doc_date).slice(0, 10) : null,
          period: String(e.period ?? "").trim() || null,
          vatRate: String(e.vatRate ?? "").trim() || null,
          employeeName: String(e.employeeName ?? "").trim() || null,
          vehicleText: String(e.vehicleText ?? "").trim() || null,
          supplierName: String(e.supplierName ?? "").trim() || null,
          supplierInn: String(e.supplierInn ?? "").trim() || null,
        };
      });

    let salaryExpenses: any[] = [];
    try {
      const { rows: salaryTypeRows } = await pool.query(
        `SELECT department,
                logistics_stage AS "logisticsStage",
                type,
                name,
                expense_category_id AS "expenseCategoryId"
         FROM pnl_expense_categories
         WHERE expense_category_id = 'salary'
            OR lower(trim(name)) LIKE 'зарплат%'
            OR lower(trim(name)) LIKE '%фот%'
            OR lower(trim(name)) LIKE '%заработн%'`
      );
      const salaryTypeMap = new Map<string, string>(
        salaryTypeRows.map((r: any) => [
          `${String(r.department ?? "")}::${String(r.logisticsStage ?? "")}`,
          String(r.type ?? "").trim().toUpperCase() || "OPEX",
        ])
      );
      const salaryTypeByStage = new Map<string, string>();
      salaryTypeRows.forEach((r: any) => {
        const stageKey = String(r.logisticsStage ?? "").trim().toUpperCase();
        const typeValue = String(r.type ?? "").trim().toUpperCase();
        if (!stageKey || !typeValue || salaryTypeByStage.has(stageKey)) return;
        salaryTypeByStage.set(stageKey, typeValue);
      });
      const resolveSalaryType = (dep: string, stage: string | null): string => {
        // Priority:
        // 1) exact row subdivision
        // 2) row department without stage
        // 3) currently selected subdivision from request (department/logisticsStage)
        // 4) selected department without stage
        // 5) any salary type from directory
        const exact = `${dep}::${String(stage ?? "")}`;
        const depOnly = `${dep}::`;
        const stageOnly = String(stage ?? "").trim().toUpperCase();
        const selectedExact = `${String(department ?? "")}::${String(logisticsStage ?? "")}`;
        const selectedDepOnly = `${String(department ?? "")}::`;
        return (
          salaryTypeMap.get(exact) ||
          salaryTypeMap.get(depOnly) ||
          salaryTypeByStage.get(stageOnly) ||
          salaryTypeMap.get(selectedExact) ||
          salaryTypeMap.get(selectedDepOnly) ||
          salaryTypeRows.map((r: any) => String(r.type ?? "").trim().toUpperCase()).find(Boolean) ||
          "OPEX"
        );
      };

      let accrualRows: any[] = [];
      try {
        const result = await pool.query(
          `SELECT e.employee_id AS "employeeId",
                  e.work_date::text AS "workDate",
                  e.value_text AS "valueText",
                  ru.department AS "employeeDepartment",
                  ru.accrual_type AS "accrualType",
                  ru.accrual_rate AS "accrualRate",
                  sro.shift_rate AS "shiftRateOverride"
           FROM employee_timesheet_entries e
           JOIN registered_users ru ON ru.id = e.employee_id
           LEFT JOIN employee_timesheet_shift_rate_overrides sro
             ON sro.employee_id = e.employee_id
            AND sro.work_date = e.work_date
           WHERE e.work_date >= $1::date
             AND e.work_date < $2::date`,
          [period, nextPeriod]
        );
        accrualRows = result.rows;
      } catch (e) {
        logError(ctx, "pnl_manual_entry_timesheet_entries_read_failed", e);
        accrualRows = [];
      }

      const grouped = new Map<string, { amount: number; count: number; department: string; logisticsStage: string | null }>();
      accrualRows.forEach((r: any) => {
        const accrualType = normalizeAccrualType(r.accrualType);
        const rate = Number(r.accrualRate || 0);
        const valueText = String(r.valueText || "");
        const mark = normalizeShiftMark(valueText);
        let amountAbs = 0;
        if (accrualType === "shift") {
          if (mark !== "Я") return;
          const override = Number(r.shiftRateOverride);
          const dayRate = Number.isFinite(override) ? override : rate;
          amountAbs = Math.abs(dayRate || 0);
        } else if (accrualType === "month") {
          if (mark !== "Я") return;
          amountAbs = Math.abs((rate || 0) / 21);
        } else {
          const hours = parseHoursValue(valueText);
          amountAbs = Math.abs(hours * (rate || 0));
        }
        if (!(amountAbs > 0)) return;
        const primary = mapPrimaryDepartmentCandidate(r.employeeDepartment);
        let matched: Array<{ department: string; logisticsStage: string | null }> = [primary];
        if (department != null) {
          matched = matched.filter((m) => m.department === department);
        }
        if (logisticsStage === "" || logisticsStage === "null") {
          matched = matched.filter((m) => m.logisticsStage == null);
        } else if (logisticsStage) {
          const strict = matched.filter((m) => m.logisticsStage === logisticsStage);
          // If employee is assigned to a broad department without stage (e.g. LOGISTICS_MSK),
          // include it in the currently selected stage so salary is visible in subdivision view.
          matched = strict.length > 0
            ? strict
            : matched
              .filter((m) => m.logisticsStage == null)
              .map((m) => ({ ...m, logisticsStage }));
        }
        if (matched.length === 0) return;
        matched.forEach((mapped) => {
          const key = `${mapped.department}::${String(mapped.logisticsStage ?? "")}`;
          const prev = grouped.get(key) || { amount: 0, count: 0, department: mapped.department, logisticsStage: mapped.logisticsStage };
          prev.amount += amountAbs;
          prev.count += 1;
          grouped.set(key, prev);
        });
      });

      salaryExpenses = Array.from(grouped.values()).map((g) => ({
        id: `timesheet-salary:${periodKey}:${g.department}:${String(g.logisticsStage ?? "none")}`,
        categoryId: `timesheet-salary:${g.department}:${String(g.logisticsStage ?? "none")}`,
        categoryName: "Зарплата",
        amount: Number(Number(g.amount).toFixed(2)),
        comment: `По табелю (${g.count} начислений)`,
        direction: "",
        transportType: "",
        type: resolveSalaryType(g.department, g.logisticsStage),
        department: g.department,
        logisticsStage: g.logisticsStage,
        source: "timesheet_salary",
        requestStatus: null,
      }));
    } catch (e) {
      logError(ctx, "pnl_manual_entry_timesheet_salary_failed", e);
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
        logError(ctx, "pnl_manual_entry_fallback_ops_read_failed", e);
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
    if (!period) return res.status(400).json({ error: "period required", request_id: ctx.requestId });

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
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}
