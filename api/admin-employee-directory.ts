import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

const EMPLOYEE_ROLES = new Set(["employee", "department_head"]);

type ColumnName = { column_name: string };

async function ensureEmployeeColumns(pool: ReturnType<typeof getPool>) {
  const { rows } = await pool.query<ColumnName>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'registered_users'`
  );
  const cols = new Set(rows.map((r) => r.column_name));
  const has = cols.has("full_name") && cols.has("department") && cols.has("employee_role");
  const hasPosition = cols.has("position");
  return { cols, has, hasPosition };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (!getAdminTokenPayload(token)?.superAdmin) {
    return res.status(403).json({ error: "Доступ только для супер-администратора" });
  }

  const pool = getPool();
  const columnsInfo = await ensureEmployeeColumns(pool);
  if (!columnsInfo.has) {
    return res.status(400).json({ error: "Нужна миграция 027_registered_users_employee_directory.sql" });
  }

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      id: number;
      login: string;
      full_name: string | null;
      department: string | null;
      position: string | null;
      employee_role: "employee" | "department_head" | null;
      active: boolean;
      invited_with_preset_label: string | null;
      created_at: string;
    }>(
      `SELECT id, login, full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, employee_role, active, invited_with_preset_label, created_at
       FROM registered_users
       WHERE (coalesce(trim(full_name), '') <> '' OR employee_role is not null OR invited_by_user_id is not null)
       ORDER BY created_at DESC`
    );
    return res.status(200).json({ ok: true, items: rows });
  }

  if (req.method === "POST") {
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const fullName = String(body?.full_name || "").trim();
    const department = String(body?.department || "").trim();
    const position = String(body?.position || "").trim();
    const employeeRole = String(body?.employee_role || "employee").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Некорректный email" });
    if (!fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (!department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });

    try {
      const existingUser = await pool.query<{ id: number; permissions: Record<string, boolean> | null }>(
        "SELECT id, permissions FROM registered_users WHERE lower(trim(login)) = $1",
        [email]
      );
      const user = existingUser.rows[0];
      if (!user) {
        return res.status(400).json({ error: "Пользователь с таким email не найден" });
      }

      const currentPermissions =
        user.permissions && typeof user.permissions === "object" ? user.permissions : {};
      const nextPermissions: Record<string, boolean> = {
        ...currentPermissions,
        haulz: true,
        supervisor: employeeRole === "department_head",
      };

      const hasUpdatedAt = columnsInfo.cols.has("updated_at");
      await pool.query(
        `UPDATE registered_users
         SET permissions = $1,
             full_name = $2,
             department = $3,
             ${columnsInfo.hasPosition ? "position = $4," : ""}
             employee_role = ${columnsInfo.hasPosition ? "$5" : "$4"}
             ${hasUpdatedAt ? ", updated_at = now()" : ""}
         WHERE id = ${columnsInfo.hasPosition ? "$6" : "$5"}`,
        columnsInfo.hasPosition
          ? [JSON.stringify(nextPermissions), fullName, department, position, employeeRole, user.id]
          : [JSON.stringify(nextPermissions), fullName, department, employeeRole, user.id]
      );

      return res.status(200).json({ ok: true, id: user.id });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка сохранения атрибутов сотрудника" });
    }
  }

  if (req.method === "PATCH") {
    const id = parseInt(String(req.query?.id || "0"), 10);
    if (!id) return res.status(400).json({ error: "id обязателен" });
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    const hasUpdatedAt = columnsInfo.cols.has("updated_at");
    const hasProfileUpdate =
      typeof body?.full_name === "string" ||
      typeof body?.department === "string" ||
      typeof body?.position === "string" ||
      typeof body?.employee_role === "string";

    if (typeof body?.active !== "boolean" && !hasProfileUpdate) {
      return res.status(400).json({ error: "Передайте active или атрибуты сотрудника" });
    }

    if (typeof body?.active === "boolean" && !hasProfileUpdate) {
      await pool.query(
        `UPDATE registered_users
         SET active = $1${hasUpdatedAt ? ", updated_at = now()" : ""}
         WHERE id = $2`,
        [body.active, id]
      );
      return res.status(200).json({ ok: true });
    }

    const existing = await pool.query<{
      full_name: string | null;
      department: string | null;
      position: string | null;
      employee_role: "employee" | "department_head" | null;
      permissions: Record<string, boolean> | null;
    }>(
      `SELECT full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, employee_role, permissions
       FROM registered_users WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Сотрудник не найден" });
    const row = existing.rows[0];
    const hasFullNameUpdate = typeof body?.full_name === "string";
    const hasDepartmentUpdate = typeof body?.department === "string";
    const hasPositionUpdate = typeof body?.position === "string";
    const hasRoleUpdate = typeof body?.employee_role === "string";

    const fullName = hasFullNameUpdate ? String(body.full_name).trim() : "";
    const department = hasDepartmentUpdate ? String(body.department).trim() : "";
    const position = hasPositionUpdate ? String(body.position).trim() : "";
    const employeeRole = hasRoleUpdate
      ? String(body.employee_role).trim()
      : (row.employee_role || (row.permissions?.supervisor ? "department_head" : "employee"));

    if (hasFullNameUpdate && !fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (hasDepartmentUpdate && !department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });
    const currentPermissions =
      row.permissions && typeof row.permissions === "object"
        ? row.permissions
        : {};
    const nextPermissions: Record<string, boolean> = {
      ...currentPermissions,
      haulz: true,
      supervisor: employeeRole === "department_head",
    };

    const setParts: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    setParts.push(`permissions = ${addParam(JSON.stringify(nextPermissions))}`);
    if (hasFullNameUpdate) setParts.push(`full_name = ${addParam(fullName)}`);
    if (hasDepartmentUpdate) setParts.push(`department = ${addParam(department)}`);
    if (hasPositionUpdate && columnsInfo.hasPosition) setParts.push(`position = ${addParam(position)}`);
    if (hasRoleUpdate) setParts.push(`employee_role = ${addParam(employeeRole)}`);
    if (hasUpdatedAt) setParts.push("updated_at = now()");

    await pool.query(
      `UPDATE registered_users
       SET ${setParts.join(", ")}
       WHERE id = ${addParam(id)}`,
      params
    );
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = parseInt(String(req.query?.id || "0"), 10);
    if (!id) return res.status(400).json({ error: "id обязателен" });
    await pool.query("DELETE FROM registered_users WHERE id = $1", [id]);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorLog(handler);
