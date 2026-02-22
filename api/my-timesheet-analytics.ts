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

function isShiftEnabled(rawValue: string): boolean {
  const raw = String(rawValue || "").trim().toUpperCase();
  return raw === "С" || raw === "C" || raw === "1" || raw === "TRUE";
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
    const hasAnalyticsScope = permissions.analytics === true;
    const canUseDepartmentScope = !hasAnalyticsScope && permissions.supervisor === true && !!meDepartment;
    const companyOwnerId = me.invited_by_user_id ?? me.id;

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
       WHERE id <> $1
         AND (
           ($2::boolean = true AND invited_by_user_id = $3)
           OR invited_by_user_id = $1
           OR ($4::boolean = true AND lower(trim(coalesce(department, ''))) = lower(trim($5)))
           OR (
             $2::boolean = true
             AND EXISTS (
               SELECT 1
               FROM employee_timesheet_entries te
               WHERE te.employee_id = registered_users.id
                 AND te.work_date >= $6::date
                 AND te.work_date <= $7::date
             )
           )
         )
       ORDER BY coalesce(full_name, login), id`,
      [me.id, hasAnalyticsScope, companyOwnerId, canUseDepartmentScope, meDepartment, dateFrom, dateTo]
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
        dateFrom,
        dateTo,
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
      [employeeIds, dateFrom, dateTo]
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

      if (employee.accrualType === "shift") {
        employeeShifts = entries.reduce((acc, e) => acc + (isShiftEnabled(e.value) ? 1 : 0), 0);
        employeeHours = employeeShifts * 8;
      } else {
        employeeHours = entries.reduce((acc, e) => {
          const parsed = Number(String(e.value || "").replace(",", "."));
          return acc + (Number.isFinite(parsed) ? parsed : 0);
        }, 0);
      }

      const employeeCost = employee.accrualType === "shift"
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
      dateFrom,
      dateTo,
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

