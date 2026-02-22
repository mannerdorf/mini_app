import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

type Body = {
  login?: string;
  password?: string;
  month?: string;
  employeeId?: number;
  date?: string;
  value?: string;
};

function normalizeAccrualType(value: unknown): "hour" | "shift" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || !password) {
    return res.status(400).json({ error: "Укажите логин и пароль" });
  }

  try {
    const pool = getPool();
    await ensureTimesheetTable(pool);
    const meRes = await pool.query<{
      id: number;
      password_hash: string;
      department: string | null;
      permissions: Record<string, boolean> | null;
      active: boolean;
    }>(
      "SELECT id, password_hash, department, permissions, active FROM registered_users WHERE lower(trim(login)) = $1",
      [login]
    );
    const me = meRes.rows[0];
    if (!me || !me.active || !verifyPassword(password, me.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const perms = me.permissions && typeof me.permissions === "object" ? me.permissions : {};
    if (perms.supervisor !== true || perms.haulz !== true) {
      return res.status(403).json({ error: "Доступ только для руководителей подразделений HAULZ" });
    }

    const department = String(me.department || "").trim();
    const monthInfo = parseMonth(body.month || "");
    if (!monthInfo) return res.status(400).json({ error: "Укажите месяц в формате YYYY-MM" });

    if (req.method === "PATCH") {
      const employeeId = Number(body.employeeId);
      const date = String(body.date || "").trim();
      const value = String(body.value || "").trim();
      if (!department) return res.status(400).json({ error: "У пользователя не задано подразделение" });
      if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date обязателен в формате YYYY-MM-DD" });
      if (!date.startsWith(`${monthInfo.month}-`)) return res.status(400).json({ error: "Дата не соответствует выбранному месяцу" });

      const employeeRes = await pool.query<{ id: number }>(
        `SELECT id
         FROM registered_users
         WHERE id = $1
           AND lower(trim(coalesce(department, ''))) = lower(trim($2))
           AND coalesce((permissions->>'haulz')::boolean, false) = true
         LIMIT 1`,
        [employeeId, department]
      );
      if (employeeRes.rows.length === 0) return res.status(403).json({ error: "Нет доступа к сотруднику другого подразделения" });

      if (value === "") {
        await pool.query("DELETE FROM employee_timesheet_entries WHERE employee_id = $1 AND work_date = $2::date", [employeeId, date]);
        return res.status(200).json({ ok: true });
      }
      await pool.query(
        `INSERT INTO employee_timesheet_entries(employee_id, work_date, value_text)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (employee_id, work_date)
         DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = now()`,
        [employeeId, date, value]
      );
      return res.status(200).json({ ok: true });
    }

    if (!department) return res.status(200).json({ month: monthInfo.month, department: "", employees: [], entries: {} });

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

    const listRes = await pool.query<{
      id: number;
      login: string;
      department: string | null;
      full_name: string | null;
      position: string | null;
      employee_role: "employee" | "department_head" | null;
      accrual_type: "hour" | "shift" | null;
      accrual_rate: number | null;
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
      }, active
       FROM registered_users
       WHERE lower(trim(coalesce(department, ''))) = lower(trim($1))
         AND coalesce((permissions->>'haulz')::boolean, false) = true
       ORDER BY coalesce(full_name, login), login`,
      [department]
    );

    const employeeIds = listRes.rows.map((r) => r.id);
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

    return res.status(200).json({
      month: monthInfo.month,
      department,
      employees: listRes.rows.map((r) => ({
        id: r.id,
        login: r.login,
        fullName: r.full_name || "",
        department: r.department || "",
        position: r.position || "",
        employeeRole: r.employee_role || "employee",
        accrualType: normalizeAccrualType(r.accrual_type),
        accrualRate: r.accrual_rate == null ? 0 : Number(r.accrual_rate),
        active: r.active,
      })),
      entries,
    });
  } catch (e) {
    console.error("my-department-timesheet error:", e);
    return res.status(500).json({ error: "Ошибка загрузки табеля подразделения" });
  }
}

