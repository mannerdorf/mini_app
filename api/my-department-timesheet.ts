import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

type Body = { login?: string; password?: string };

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    if (!department) {
      return res.status(200).json({ department: "", employees: [] });
    }

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

    return res.status(200).json({
      department,
      employees: listRes.rows.map((r) => ({
        id: r.id,
        login: r.login,
        fullName: r.full_name || "",
        department: r.department || "",
        position: r.position || "",
        employeeRole: r.employee_role || "employee",
        accrualType: r.accrual_type || "hour",
        accrualRate: r.accrual_rate == null ? 0 : Number(r.accrual_rate),
        active: r.active,
      })),
    });
  } catch (e) {
    console.error("my-department-timesheet error:", e);
    return res.status(500).json({ error: "Ошибка загрузки табеля подразделения" });
  }
}

