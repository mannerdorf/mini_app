import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, getAdminTokenPayload, verifyAdminToken } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function normalizeAccrualType(value: unknown): "hour" | "shift" | "month" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  if (raw.includes("month") || raw.includes("месяц")) return "month";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeCooperationType(value: unknown): "self_employed" | "ip" | "staff" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "staff";
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  return "staff";
}

function parsePaidDatesJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x || ""));
  if (value && typeof value === "object") {
    try {
      const arr = Object.values(value as Record<string, unknown>);
      return arr.map((x) => String(x ?? ""));
    } catch {
      return [];
    }
  }
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return Array.isArray(p) ? p.map((x: unknown) => String(x || "")) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseMonth(value: unknown): { month: string; start: string; next: string } | null {
  const month = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yRaw, mRaw] = month.split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null;
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const nextDate = new Date(year, monthNum, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-01`;
  return { month, start, next };
}

async function ensureTimesheetTable(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_entries (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      work_date date NOT NULL,
      value_text text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, work_date)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_entries_work_date_idx ON employee_timesheet_entries(work_date)");
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_entries_employee_id_idx ON employee_timesheet_entries(employee_id)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_month_exclusions (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      month_key date NOT NULL,
      created_by_user_id bigint REFERENCES registered_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, month_key)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_month_exclusions_month_idx ON employee_timesheet_month_exclusions(month_key)");
  await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS cooperation_type text");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_shift_rate_overrides (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      work_date date NOT NULL,
      shift_rate numeric(12,2) NOT NULL,
      created_by_user_id bigint REFERENCES registered_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, work_date)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_shift_rate_overrides_work_date_idx ON employee_timesheet_shift_rate_overrides(work_date)");
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_shift_rate_overrides_employee_id_idx ON employee_timesheet_shift_rate_overrides(employee_id)");
}

/**
 * Сводный табель по всей компании для CMS (суперадмин). Формат ответа совместим с /api/my-department-timesheet при allDepartments.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-company-timesheet");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }
  const monthRaw = (body as { month?: string })?.month;
  const monthInfo = parseMonth(monthRaw);
  if (!monthInfo) return res.status(400).json({ error: "Укажите месяц в формате YYYY-MM", request_id: ctx.requestId });

  try {
    const pool = getPool();
    await ensureTimesheetTable(pool);
    const department = "";
    const canViewAllDepartments = true;

    const colsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'registered_users'`
    );
    const cols = new Set(colsRes.rows.map((r) => r.column_name));
    const hasFullName = cols.has("full_name");
    const hasPosition = cols.has("position");
    const hasEmployeeRole = cols.has("employee_role");
    const hasAccrualType = cols.has("accrual_type");
    const hasAccrualRate = cols.has("accrual_rate");
    const hasCooperationType = cols.has("cooperation_type");

    const listRes = await pool.query<{
      id: number;
      login: string;
      department: string | null;
      full_name: string | null;
      position: string | null;
      employee_role: "employee" | "department_head" | null;
      accrual_type: "hour" | "shift" | "month" | null;
      accrual_rate: number | null;
      cooperation_type: "self_employed" | "ip" | "staff" | null;
      active: boolean;
    }>(
      `SELECT id, login, department${
        hasFullName ? ", full_name" : ", null::text as full_name"
      }${
        hasPosition ? ", position" : ", null::text as position"
      }${
        hasEmployeeRole ? ", employee_role" : ", null::text as employee_role"
      }${
        hasAccrualType ? ", accrual_type" : ", null::text as accrual_type"
      }${
        hasAccrualRate ? ", accrual_rate" : ", null::numeric as accrual_rate"
      }${
        hasCooperationType ? ", cooperation_type" : ", null::text as cooperation_type"
      }, active
       FROM registered_users
       WHERE active = true
         ${hasEmployeeRole ? "AND coalesce(employee_role, 'employee') in ('employee', 'department_head')" : ""}
         AND id NOT IN (
           SELECT employee_id
           FROM employee_timesheet_month_exclusions
           WHERE month_key = $1::date
         )
       ORDER BY coalesce(full_name, login), login`,
      [monthInfo.start]
    );

    const employeeIds = listRes.rows.map((r) => r.id);
    const availableRes = await pool.query<{
      id: number;
      login: string;
      full_name: string | null;
      position: string | null;
      employee_role: "employee" | "department_head" | null;
    }>(
      `SELECT id, login${
        hasFullName ? ", full_name" : ", null::text as full_name"
      }${
        hasPosition ? ", position" : ", null::text as position"
      }${
        hasEmployeeRole ? ", employee_role" : ", null::text as employee_role"
      }
       FROM registered_users
       WHERE active = true
         ${hasEmployeeRole ? "AND coalesce(employee_role, 'employee') in ('employee', 'department_head')" : ""}
         AND id IN (
           SELECT employee_id
           FROM employee_timesheet_month_exclusions
           WHERE month_key = $1::date
         )
       ORDER BY coalesce(full_name, login), login`,
      [monthInfo.start]
    );
    const entries: Record<string, string> = {};
    if (employeeIds.length > 0) {
      const entriesRes = await pool.query<{ employee_id: number; work_date: string; value_text: string }>(
        `SELECT employee_id, work_date::text as work_date, value_text
         FROM employee_timesheet_entries
         WHERE work_date >= $1::date
           AND work_date < $2::date
           AND employee_id = ANY($3::int[])`,
        [monthInfo.start, monthInfo.next, employeeIds]
      );
      for (const row of entriesRes.rows) {
        entries[`${row.employee_id}__${row.work_date}`] = String(row.value_text || "");
      }
    }
    const payoutsByEmployee: Record<string, number> = {};
    const paidDatesByEmployee: Record<string, string[]> = {};
    const shiftRateOverrides: Record<string, number> = {};
    if (employeeIds.length > 0) {
      const payoutsRes = await pool.query<{ employee_id: number; total_paid: number }>(
        `SELECT employee_id, COALESCE(SUM(amount), 0) as total_paid
         FROM employee_timesheet_payouts
         WHERE period_month = $1::date
           AND employee_id = ANY($2::int[])
         GROUP BY employee_id`,
        [monthInfo.start, employeeIds]
      );
      for (const row of payoutsRes.rows) {
        payoutsByEmployee[String(row.employee_id)] = Number(row.total_paid || 0);
      }
      const paidDatesRes = await pool.query<{ employee_id: number; work_date: string }>(
        `SELECT p.employee_id, d.value as work_date
         FROM employee_timesheet_payouts p
         CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.paid_dates, '[]'::jsonb)) d(value)
         WHERE p.period_month = $1::date
           AND p.employee_id = ANY($2::int[])`,
        [monthInfo.start, employeeIds]
      );
      for (const row of paidDatesRes.rows) {
        const key = String(row.employee_id);
        paidDatesByEmployee[key] = paidDatesByEmployee[key] || [];
        paidDatesByEmployee[key].push(String(row.work_date || ""));
      }
      const shiftRateRes = await pool.query<{ employee_id: number; work_date: string; shift_rate: number }>(
        `SELECT employee_id, work_date::text as work_date, shift_rate
         FROM employee_timesheet_shift_rate_overrides
         WHERE work_date >= $1::date
           AND work_date < $2::date
           AND employee_id = ANY($3::int[])`,
        [monthInfo.start, monthInfo.next, employeeIds]
      );
      for (const row of shiftRateRes.rows) {
        shiftRateOverrides[`${row.employee_id}__${row.work_date}`] = Number(row.shift_rate || 0);
      }
    }

    const payoutsDetailByEmployee: Record<
      string,
      Array<{
        id: number;
        payoutDate: string;
        periodFrom: string;
        periodTo: string;
        amount: number;
        taxAmount: number;
        cooperationType: string;
        paidDates: string[];
        createdAt: string;
      }>
    > = {};
    if (employeeIds.length > 0) {
      const payoutDetailRes = await pool.query<{
        id: number;
        employee_id: number;
        payout_date: string;
        period_from: string;
        period_to: string;
        amount: string | number;
        tax_amount: string | number;
        cooperation_type: string | null;
        paid_dates: unknown;
        created_at: string;
      }>(
        `SELECT id, employee_id, payout_date::text as payout_date, period_from::text as period_from, period_to::text as period_to,
                amount, tax_amount, cooperation_type, paid_dates, created_at::text as created_at
         FROM employee_timesheet_payouts
         WHERE period_month = $1::date
           AND employee_id = ANY($2::int[])
         ORDER BY employee_id, created_at DESC`,
        [monthInfo.start, employeeIds]
      );
      for (const row of payoutDetailRes.rows) {
        const k = String(row.employee_id);
        payoutsDetailByEmployee[k] = payoutsDetailByEmployee[k] || [];
        payoutsDetailByEmployee[k].push({
          id: row.id,
          payoutDate: row.payout_date,
          periodFrom: row.period_from,
          periodTo: row.period_to,
          amount: Number(row.amount || 0),
          taxAmount: Number(row.tax_amount || 0),
          cooperationType: normalizeCooperationType(row.cooperation_type),
          paidDates: parsePaidDatesJson(row.paid_dates),
          createdAt: row.created_at,
        });
      }
    }

    return res.status(200).json({
      month: monthInfo.month,
      department,
      allDepartments: canViewAllDepartments,
      employees: listRes.rows.map((r) => ({
        id: r.id,
        login: r.login,
        fullName: r.full_name || "",
        department: r.department || "",
        position: r.position || "",
        employeeRole: r.employee_role || "employee",
        accrualType: normalizeAccrualType(r.accrual_type),
        accrualRate: r.accrual_rate == null ? 0 : Number(r.accrual_rate),
        cooperationType: normalizeCooperationType(r.cooperation_type || "staff"),
        active: r.active,
      })),
      availableEmployees: availableRes.rows.map((r) => ({
        id: r.id,
        login: r.login,
        fullName: r.full_name || "",
        position: r.position || "",
        employeeRole: r.employee_role || "employee",
      })),
      entries,
      payoutsByEmployee,
      payoutsDetailByEmployee,
      paidDatesByEmployee,
      shiftRateOverrides,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "admin_company_timesheet_failed", e);
    return res.status(500).json({ error: "Ошибка загрузки сводного табеля", request_id: ctx.requestId });
  }
}
