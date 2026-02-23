import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

type Body = {
  login?: string;
  password?: string;
  dateFrom?: string;
  dateTo?: string;
};

function parseBody(req: VercelRequest): Body {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body as Body) || {};
}

function normalizeAccrualType(value: unknown): "hour" | "shift" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeDate(value: unknown): string {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return date;
}

function getMonthBounds(dateIso: string): { from: string; to: string } {
  const [yRaw, mRaw] = dateIso.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  const monthSafe = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const yearSafe = Number.isFinite(year) ? year : 1970;
  const from = `${yearSafe}-${String(monthSafe).padStart(2, "0")}-01`;
  const lastDay = new Date(yearSafe, monthSafe, 0).getDate();
  const to = `${yearSafe}-${String(monthSafe).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

type ShiftMarkCode = "Я" | "ПР" | "Б" | "ОГ" | "ОТ" | "УВ";

function normalizeShiftMark(rawValue: string): ShiftMarkCode | "" {
  const raw = String(rawValue || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "Я") return "Я";
  if (raw === "ПР") return "ПР";
  if (raw === "Б") return "Б";
  if (raw === "ОГ") return "ОГ";
  if (raw === "ОТ") return "ОТ";
  if (raw === "УВ") return "УВ";
  // Backward compatibility with legacy shift markers.
  if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
  if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
  return "";
}

function parseHoursValue(rawValue: string): number {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  // HH:MM format from legacy/mobile pickers.
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && minutes >= 0 && minutes < 60) {
      return hours + minutes / 60;
    }
  }
  // Numeric values with optional suffixes ("8", "8.5", "8,5", "8ч", "8 ч").
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const login = String(body.login || "").trim().toLowerCase();
  const password = String(body.password || "");
  const dateFrom = normalizeDate(body.dateFrom);
  const dateTo = normalizeDate(body.dateTo);

  if (!login || !password) return res.status(400).json({ error: "Укажите логин и пароль" });
  if (!dateFrom || !dateTo) return res.status(400).json({ error: "Укажите период dateFrom/dateTo в формате YYYY-MM-DD" });
  if (dateFrom > dateTo) return res.status(400).json({ error: "dateFrom не может быть больше dateTo" });
  const monthRange = getMonthBounds(dateFrom);

  try {
    const pool = getPool();
    await ensureTimesheetTable(pool);

    const meRes = await pool.query<{
      id: number;
      password_hash: string;
      permissions: Record<string, boolean> | null;
      active: boolean;
      department: string | null;
      invited_by_user_id: number | null;
    }>(
      "SELECT id, password_hash, permissions, active, department, invited_by_user_id FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
      [login]
    );
    const me = meRes.rows[0];
    if (!me || !me.active || !verifyPassword(password, me.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const permissions = me.permissions && typeof me.permissions === "object" ? me.permissions : {};
    if (permissions.analytics !== true && permissions.supervisor !== true) {
      return res.status(403).json({ error: "Недостаточно прав для просмотра аналитики" });
    }

    const meDepartment = String(me.department || "").trim();
    const canViewAllDepartments = permissions.analytics === true;
    const canUseDepartmentScope = !canViewAllDepartments && permissions.supervisor === true && !!meDepartment;

    const employeesRes = await pool.query<{
      id: number;
      full_name: string | null;
      department: string | null;
      position: string | null;
      accrual_type: string | null;
      accrual_rate: number | null;
    }>(
      `SELECT id, full_name, department, position, accrual_type, accrual_rate
       FROM registered_users
       WHERE coalesce((permissions->>'haulz')::boolean, false) = true
         AND (id <> $1 OR $2::boolean = true)
         AND (
           $2::boolean = true
           OR ($3::boolean = true AND lower(trim(coalesce(department, ''))) = lower(trim($4)))
         )
         AND id NOT IN (
           SELECT employee_id
           FROM employee_timesheet_month_exclusions
           WHERE month_key = $5::date
         )
       ORDER BY coalesce(full_name, login), id`,
      [me.id, canViewAllDepartments, canUseDepartmentScope, meDepartment, monthRange.from]
    );

    const employees = employeesRes.rows.map((row) => ({
      employeeId: row.id,
      fullName: String(row.full_name || "").trim(),
      department: String(row.department || "").trim(),
      position: String(row.position || "").trim(),
      accrualType: normalizeAccrualType(row.accrual_type),
      accrualRate: row.accrual_rate == null ? 0 : Number(row.accrual_rate),
    }));
    if (employees.length === 0) {
      return res.status(200).json({
        dateFrom: monthRange.from,
        dateTo: monthRange.to,
        totalHours: 0,
        totalShifts: 0,
        totalCost: 0,
        employees: [],
      });
    }

    const employeeIds = employees.map((e) => e.employeeId);
    const entriesRes = await pool.query<{ employee_id: number; work_date: string; value_text: string }>(
      `SELECT employee_id, work_date::text as work_date, value_text
       FROM employee_timesheet_entries
       WHERE employee_id = ANY($1::int[])
         AND work_date >= $2::date
         AND work_date <= $3::date`,
      [employeeIds, monthRange.from, monthRange.to]
    );

    const entriesByEmployee = new Map<number, Array<{ value: string }>>();
    for (const row of entriesRes.rows) {
      const list = entriesByEmployee.get(row.employee_id) || [];
      list.push({ value: String(row.value_text || "") });
      entriesByEmployee.set(row.employee_id, list);
    }

    let totalHours = 0;
    let totalShifts = 0;
    let totalCost = 0;
    const employeeStats = employees.map((employee) => {
      const entries = entriesByEmployee.get(employee.employeeId) || [];
      let employeeHours = 0;
      let employeeShifts = 0;
      const hasShiftMarks = entries.some((e) => normalizeShiftMark(e.value) !== "");
      const hasNumericHours = entries.some((e) => parseHoursValue(e.value) > 0);
      const resolvedAccrualType: "hour" | "shift" =
        employee.accrualType === "shift" || (hasShiftMarks && !hasNumericHours) ? "shift" : "hour";

      if (resolvedAccrualType === "shift") {
        // Начисление в сменном графике только по отметке "Я".
        employeeShifts = entries.reduce((acc, e) => acc + (normalizeShiftMark(e.value) === "Я" ? 1 : 0), 0);
        employeeHours = employeeShifts * 8;
      } else {
        employeeHours = entries.reduce((acc, e) => acc + parseHoursValue(e.value), 0);
      }

      const employeeCost = resolvedAccrualType === "shift"
        ? employeeShifts * employee.accrualRate
        : employeeHours * employee.accrualRate;

      totalHours += employeeHours;
      totalShifts += employeeShifts;
      totalCost += employeeCost;

      return {
        ...employee,
        totalHours: Number(employeeHours.toFixed(2)),
        totalShifts: employeeShifts,
        totalCost: Number(employeeCost.toFixed(2)),
      };
    });

    return res.status(200).json({
      dateFrom: monthRange.from,
      dateTo: monthRange.to,
      totalHours: Number(totalHours.toFixed(2)),
      totalShifts,
      totalCost: Number(totalCost.toFixed(2)),
      employees: employeeStats,
    });
  } catch (e) {
    console.error("my-timesheet-analytics:", e);
    return res.status(500).json({ error: "Ошибка загрузки аналитики по табелю" });
  }
}

