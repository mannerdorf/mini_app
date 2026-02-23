import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword, hashPassword, generatePassword } from "../lib/passwordUtils.js";

type Body = {
  login?: string;
  password?: string;
  month?: string;
  employeeId?: number;
  date?: string;
  value?: string;
  email?: string;
  fullName?: string;
  department?: string;
  position?: string;
  accrualType?: "hour" | "shift" | string;
  accrualRate?: number | string;
  cooperationType?: "self_employed" | "ip" | "staff" | string;
  employeeRole?: "employee" | "department_head" | string;
  existingEmployeeId?: number | string;
};

function normalizeAccrualType(value: unknown): "hour" | "shift" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeCooperationType(value: unknown): "self_employed" | "ip" | "staff" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "staff";
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  return "staff";
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

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, PATCH, PUT, DELETE");
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
    const canViewAllDepartments = perms.analytics === true;
    const canUseSupervisorScope = perms.supervisor === true && perms.haulz === true;
    if (!canViewAllDepartments && !canUseSupervisorScope) {
      return res.status(403).json({ error: "Доступ только для руководителей подразделений HAULZ" });
    }

    const department = String(me.department || "").trim();
    const monthInfo = parseMonth(body.month || "");
    if (!monthInfo) return res.status(400).json({ error: "Укажите месяц в формате YYYY-MM" });
    const isCurrentMonth = monthInfo.month === getCurrentMonthKey();

    if (req.method === "DELETE") {
      if (!isCurrentMonth) return res.status(403).json({ error: "Руководитель может изменять табель только текущего месяца" });
      const employeeId = Number(body.employeeId);
      if (!department && !canViewAllDepartments) return res.status(400).json({ error: "У пользователя не задано подразделение" });
      if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });

      const employeeRes = canViewAllDepartments
        ? await pool.query<{ id: number }>(
            `SELECT id
             FROM registered_users
             WHERE id = $1
               AND coalesce((permissions->>'haulz')::boolean, false) = true
             LIMIT 1`,
            [employeeId]
          )
        : await pool.query<{ id: number }>(
            `SELECT id
             FROM registered_users
             WHERE id = $1
               AND lower(trim(coalesce(department, ''))) = lower(trim($2))
               AND coalesce((permissions->>'haulz')::boolean, false) = true
             LIMIT 1`,
            [employeeId, department]
          );
      if (employeeRes.rows.length === 0) return res.status(403).json({ error: "Нет доступа к сотруднику другого подразделения" });

      await pool.query(
        `INSERT INTO employee_timesheet_month_exclusions(employee_id, month_key, created_by_user_id)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (employee_id, month_key)
         DO UPDATE SET created_by_user_id = EXCLUDED.created_by_user_id`,
        [employeeId, monthInfo.start, me.id]
      );
      await pool.query(
        "DELETE FROM employee_timesheet_entries WHERE employee_id = $1 AND work_date >= $2::date AND work_date < $3::date",
        [employeeId, monthInfo.start, monthInfo.next]
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === "PUT") {
      if (!isCurrentMonth) return res.status(403).json({ error: "Руководитель может изменять табель только текущего месяца" });
      if (!department && !canViewAllDepartments) return res.status(400).json({ error: "У пользователя не задано подразделение" });
      const existingEmployeeId = Number(body.existingEmployeeId);
      if (Number.isFinite(existingEmployeeId) && existingEmployeeId > 0) {
        const existingInDepartmentRes = canViewAllDepartments
          ? await pool.query<{ id: number }>(
              `SELECT id
               FROM registered_users
               WHERE id = $1
                 AND coalesce((permissions->>'haulz')::boolean, false) = true
               LIMIT 1`,
              [existingEmployeeId]
            )
          : await pool.query<{ id: number }>(
              `SELECT id
               FROM registered_users
               WHERE id = $1
                 AND lower(trim(coalesce(department, ''))) = lower(trim($2))
                 AND coalesce((permissions->>'haulz')::boolean, false) = true
               LIMIT 1`,
              [existingEmployeeId, department]
            );
        if (existingInDepartmentRes.rows.length === 0) {
          return res.status(403).json({ error: "Можно добавить только сотрудника своего подразделения" });
        }
        await pool.query(
          "DELETE FROM employee_timesheet_month_exclusions WHERE employee_id = $1 AND month_key = $2::date",
          [existingEmployeeId, monthInfo.start]
        );
        return res.status(200).json({ ok: true, id: existingEmployeeId, mode: "include_existing" });
      }

      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const dep = String(body.department || "").trim() || department;
      const position = String(body.position || "").trim();
      const accrualType = normalizeAccrualType(body.accrualType || "hour");
      const accrualRate = Number(body.accrualRate);
      const cooperationType = normalizeCooperationType(body.cooperationType || "staff");
      const employeeRole = String(body.employeeRole || "employee").trim() === "department_head" ? "department_head" : "employee";
      if (!fullName) return res.status(400).json({ error: "Укажите ФИО" });
      if (!dep) return res.status(400).json({ error: "Укажите подразделение" });
      if (!canViewAllDepartments && dep.toLowerCase() !== department.toLowerCase()) {
        return res.status(400).json({ error: "Можно добавлять сотрудников только своего подразделения" });
      }
      if (!Number.isFinite(accrualRate) || accrualRate < 0) return res.status(400).json({ error: "Укажите корректную ставку" });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Некорректный email" });

      if (email) {
        const existing = await pool.query<{ id: number; permissions: Record<string, boolean> | null }>(
          "SELECT id, permissions FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
          [email]
        );
        const user = existing.rows[0];
        if (!user) return res.status(400).json({ error: "Пользователь с таким email не найден" });
        const currentPermissions = user.permissions && typeof user.permissions === "object" ? user.permissions : {};
        const nextPermissions: Record<string, boolean> = {
          ...currentPermissions,
          haulz: true,
          supervisor: employeeRole === "department_head",
        };
        await pool.query(
          `UPDATE registered_users
           SET permissions = $1,
               full_name = $2,
               department = $3,
               position = $4,
               accrual_type = $5,
               accrual_rate = $6,
               employee_role = $7,
               cooperation_type = $8
           WHERE id = $9`,
          [JSON.stringify(nextPermissions), fullName, dep, position, accrualType, Number(accrualRate.toFixed(2)), employeeRole, cooperationType, user.id]
        );
        await pool.query("DELETE FROM employee_timesheet_month_exclusions WHERE employee_id = $1 AND month_key = $2::date", [user.id, monthInfo.start]);
        return res.status(200).json({ ok: true, id: user.id, mode: "assign_existing" });
      }

      const internalLogin = `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@internal.local`;
      const randomPasswordHash = hashPassword(generatePassword(24));
      const permissions: Record<string, boolean> = {
        cms_access: false,
        cargo: false,
        doc_invoices: false,
        doc_acts: false,
        doc_orders: false,
        doc_claims: false,
        doc_contracts: false,
        doc_acts_settlement: false,
        doc_tariffs: false,
        haulz: true,
        chat: false,
        service_mode: false,
        analytics: false,
        supervisor: employeeRole === "department_head",
      };
      const inserted = await pool.query<{ id: number }>(
        `INSERT INTO registered_users
          (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns, active, full_name, department, position, accrual_type, accrual_rate, employee_role, cooperation_type)
         VALUES ($1, $2, '', '', $3, false, false, false, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [internalLogin, randomPasswordHash, JSON.stringify(permissions), fullName, dep, position, accrualType, Number(accrualRate.toFixed(2)), employeeRole, cooperationType]
      );
      const employeeId = inserted.rows[0]?.id;
      if (!employeeId) return res.status(500).json({ error: "Не удалось создать сотрудника" });
      await pool.query("DELETE FROM employee_timesheet_month_exclusions WHERE employee_id = $1 AND month_key = $2::date", [employeeId, monthInfo.start]);
      return res.status(200).json({ ok: true, id: employeeId, mode: "create_internal" });
    }

    if (req.method === "PATCH") {
      if (!isCurrentMonth) return res.status(403).json({ error: "Руководитель может изменять табель только текущего месяца" });
      const employeeId = Number(body.employeeId);
      const date = String(body.date || "").trim();
      const value = String(body.value || "").trim();
      if (!department && !canViewAllDepartments) return res.status(400).json({ error: "У пользователя не задано подразделение" });
      if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date обязателен в формате YYYY-MM-DD" });
      if (!date.startsWith(`${monthInfo.month}-`)) return res.status(400).json({ error: "Дата не соответствует выбранному месяцу" });

      const employeeRes = canViewAllDepartments
        ? await pool.query<{ id: number }>(
            `SELECT id
             FROM registered_users
             WHERE id = $1
               AND coalesce((permissions->>'haulz')::boolean, false) = true
             LIMIT 1`,
            [employeeId]
          )
        : await pool.query<{ id: number }>(
            `SELECT id
             FROM registered_users
             WHERE id = $1
               AND lower(trim(coalesce(department, ''))) = lower(trim($2))
               AND coalesce((permissions->>'haulz')::boolean, false) = true
             LIMIT 1`,
            [employeeId, department]
          );
      if (employeeRes.rows.length === 0) return res.status(403).json({ error: "Нет доступа к сотруднику другого подразделения" });
      const paidDateRes = await pool.query<{ work_date: string }>(
        `SELECT d.value as work_date
         FROM employee_timesheet_payouts p
         CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.paid_dates, '[]'::jsonb)) d(value)
         WHERE p.employee_id = $1
           AND p.period_month = $2::date
           AND d.value = $3
         LIMIT 1`,
        [employeeId, monthInfo.start, date]
      );
      if (paidDateRes.rows.length > 0) {
        return res.status(409).json({ error: `День ${date} уже оплачен. Изменение или отмена запрещены.` });
      }

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

    if (!department && !canViewAllDepartments) return res.status(200).json({ month: monthInfo.month, department: "", allDepartments: false, employees: [], availableEmployees: [], entries: {} });

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
      accrual_type: "hour" | "shift" | null;
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
       WHERE coalesce((permissions->>'haulz')::boolean, false) = true
         ${canViewAllDepartments ? "" : "AND lower(trim(coalesce(department, ''))) = lower(trim($1))"}
         AND id NOT IN (
           SELECT employee_id
           FROM employee_timesheet_month_exclusions
           WHERE month_key = $${canViewAllDepartments ? "1" : "2"}::date
         )
       ORDER BY coalesce(full_name, login), login`,
      canViewAllDepartments ? [monthInfo.start] : [department, monthInfo.start]
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
       WHERE coalesce((permissions->>'haulz')::boolean, false) = true
         ${canViewAllDepartments ? "" : "AND lower(trim(coalesce(department, ''))) = lower(trim($1))"}
         AND id IN (
           SELECT employee_id
           FROM employee_timesheet_month_exclusions
           WHERE month_key = $${canViewAllDepartments ? "1" : "2"}::date
         )
       ORDER BY coalesce(full_name, login), login`,
      canViewAllDepartments ? [monthInfo.start] : [department, monthInfo.start]
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
      paidDatesByEmployee,
    });
  } catch (e) {
    console.error("my-department-timesheet error:", e);
    return res.status(500).json({ error: "Ошибка загрузки табеля подразделения" });
  }
}

