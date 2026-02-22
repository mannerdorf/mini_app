import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

const EMPLOYEE_ROLES = new Set(["employee", "department_head"]);
const ACCRUAL_TYPES = new Set(["hour", "shift"]);

type ColumnName = { column_name: string };

function normalizeAccrualType(value: unknown): "hour" | "shift" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

async function ensureEmployeeColumns(pool: ReturnType<typeof getPool>) {
  const readCols = async () => {
    const { rows } = await pool.query<ColumnName>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'registered_users'`
    );
    return new Set(rows.map((r) => r.column_name));
  };
  let cols = await readCols();
  if (!cols.has("position")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS position text");
  }
  if (!cols.has("accrual_type")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS accrual_type text");
  }
  if (!cols.has("accrual_rate")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS accrual_rate numeric(12,2)");
  }
  cols = await readCols();
  const has = cols.has("full_name") && cols.has("department") && cols.has("employee_role");
  const hasPosition = cols.has("position");
  const hasAccrualType = cols.has("accrual_type");
  const hasAccrualRate = cols.has("accrual_rate");
  return { cols, has, hasPosition, hasAccrualType, hasAccrualRate };
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
      accrual_type: "hour" | "shift" | null;
      accrual_rate: number | null;
      employee_role: "employee" | "department_head" | null;
      active: boolean;
      invited_with_preset_label: string | null;
      created_at: string;
    }>(
      `SELECT id, login, full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, ${columnsInfo.hasAccrualType ? "accrual_type" : "null::text as accrual_type"}, ${
        columnsInfo.hasAccrualRate ? "accrual_rate" : "null::numeric as accrual_rate"
      }, employee_role, active, invited_with_preset_label, created_at
       FROM registered_users
       WHERE (coalesce(trim(full_name), '') <> '' OR employee_role is not null OR invited_by_user_id is not null)
       ORDER BY created_at DESC`
    );
    return res.status(200).json({
      ok: true,
      items: rows.map((r) => ({
        ...r,
        accrual_type: normalizeAccrualType(r.accrual_type),
      })),
    });
  }

  if (req.method === "POST") {
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    const emailRaw = String(body?.email || "").trim();
    const email = emailRaw.toLowerCase();
    const fullName = String(body?.full_name || "").trim();
    const department = String(body?.department || "").trim();
    const position = String(body?.position || "").trim();
    const accrualType = normalizeAccrualType(body?.accrual_type || "hour");
    const accrualRateRaw = body?.accrual_rate;
    const accrualRate = Number(accrualRateRaw);
    const employeeRole = String(body?.employee_role || "employee").trim();
    if (!fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (!department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });
    if (!ACCRUAL_TYPES.has(accrualType)) return res.status(400).json({ error: "Некорректный тип начисления" });
    if (!Number.isFinite(accrualRate) || accrualRate < 0) return res.status(400).json({ error: "Укажите корректную ставку начисления" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Некорректный email" });

    try {
      // If email is provided, assign attributes to an existing account.
      if (email) {
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
               ${columnsInfo.hasAccrualType ? `accrual_type = ${columnsInfo.hasPosition ? "$5" : "$4"},` : ""}
               ${columnsInfo.hasAccrualRate ? `accrual_rate = ${columnsInfo.hasPosition ? (columnsInfo.hasAccrualType ? "$6" : "$5") : (columnsInfo.hasAccrualType ? "$5" : "$4")},` : ""}
               employee_role = ${
                 columnsInfo.hasPosition
                   ? (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$7" : "$6") : (columnsInfo.hasAccrualRate ? "$6" : "$5"))
                   : (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$6" : "$5") : (columnsInfo.hasAccrualRate ? "$5" : "$4"))
               }
               ${hasUpdatedAt ? ", updated_at = now()" : ""}
           WHERE id = ${
             columnsInfo.hasPosition
               ? (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$8" : "$7") : (columnsInfo.hasAccrualRate ? "$7" : "$6"))
               : (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$7" : "$6") : (columnsInfo.hasAccrualRate ? "$6" : "$5"))
           }`,
          (() => {
            const params: unknown[] = [JSON.stringify(nextPermissions), fullName, department];
            if (columnsInfo.hasPosition) params.push(position);
            if (columnsInfo.hasAccrualType) params.push(accrualType);
            if (columnsInfo.hasAccrualRate) params.push(Number(accrualRate.toFixed(2)));
            params.push(employeeRole, user.id);
            return params;
          })()
        );

        return res.status(200).json({ ok: true, id: user.id, mode: "assign_existing" });
      }

      // If email is empty, create an internal employee record without mail login.
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
      const hasUpdatedAt = columnsInfo.cols.has("updated_at");
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO registered_users
          (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns, active, full_name, department${
            columnsInfo.hasPosition ? ", position" : ""
          }${columnsInfo.hasAccrualType ? ", accrual_type" : ""}${columnsInfo.hasAccrualRate ? ", accrual_rate" : ""}, employee_role${hasUpdatedAt ? ", updated_at" : ""})
         VALUES ($1, $2, '', '', $3, false, false, false, $4, $5${
           columnsInfo.hasPosition ? ", $6" : ""
         }${columnsInfo.hasAccrualType ? `, ${columnsInfo.hasPosition ? "$7" : "$6"}` : ""}${
           columnsInfo.hasAccrualRate
             ? `, ${columnsInfo.hasPosition ? (columnsInfo.hasAccrualType ? "$8" : "$7") : (columnsInfo.hasAccrualType ? "$7" : "$6")}`
             : ""
         }, ${
           columnsInfo.hasPosition
             ? (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$9" : "$8") : (columnsInfo.hasAccrualRate ? "$8" : "$7"))
             : (columnsInfo.hasAccrualType ? (columnsInfo.hasAccrualRate ? "$8" : "$7") : (columnsInfo.hasAccrualRate ? "$7" : "$6"))
         }${hasUpdatedAt ? ", now()" : ""})
         RETURNING id`,
        (() => {
          const params: unknown[] = [internalLogin, randomPasswordHash, JSON.stringify(permissions), fullName, department];
          if (columnsInfo.hasPosition) params.push(position);
          if (columnsInfo.hasAccrualType) params.push(accrualType);
          if (columnsInfo.hasAccrualRate) params.push(Number(accrualRate.toFixed(2)));
          params.push(employeeRole);
          return params;
        })()
      );
      return res.status(200).json({ ok: true, id: rows[0]?.id, mode: "create_internal" });
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
      typeof body?.accrual_type === "string" ||
      typeof body?.accrual_rate !== "undefined" ||
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
      accrual_type: "hour" | "shift" | null;
      accrual_rate: number | null;
      employee_role: "employee" | "department_head" | null;
      permissions: Record<string, boolean> | null;
    }>(
      `SELECT full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, ${columnsInfo.hasAccrualType ? "accrual_type" : "null::text as accrual_type"}, ${
        columnsInfo.hasAccrualRate ? "accrual_rate" : "null::numeric as accrual_rate"
      }, employee_role, permissions
       FROM registered_users WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Сотрудник не найден" });
    const row = existing.rows[0];
    const hasFullNameUpdate = typeof body?.full_name === "string";
    const hasDepartmentUpdate = typeof body?.department === "string";
    const hasPositionUpdate = typeof body?.position === "string";
    const hasAccrualTypeUpdate = typeof body?.accrual_type === "string";
    const hasAccrualRateUpdate = typeof body?.accrual_rate !== "undefined";
    const hasRoleUpdate = typeof body?.employee_role === "string";

    const fullName = hasFullNameUpdate ? String(body.full_name).trim() : "";
    const department = hasDepartmentUpdate ? String(body.department).trim() : "";
    const position = hasPositionUpdate ? String(body.position).trim() : "";
    const accrualType = hasAccrualTypeUpdate
      ? normalizeAccrualType(body.accrual_type)
      : normalizeAccrualType(row.accrual_type || "hour");
    const accrualRate = hasAccrualRateUpdate
      ? Number(body.accrual_rate)
      : (row.accrual_rate == null ? 0 : Number(row.accrual_rate));
    const employeeRole = hasRoleUpdate
      ? String(body.employee_role).trim()
      : (row.employee_role || (row.permissions?.supervisor ? "department_head" : "employee"));

    if (hasFullNameUpdate && !fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (hasDepartmentUpdate && !department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!ACCRUAL_TYPES.has(accrualType)) return res.status(400).json({ error: "Некорректный тип начисления" });
    if (!Number.isFinite(accrualRate) || accrualRate < 0) return res.status(400).json({ error: "Укажите корректную ставку начисления" });
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
    if (hasAccrualTypeUpdate && columnsInfo.hasAccrualType) setParts.push(`accrual_type = ${addParam(accrualType)}`);
    if (hasAccrualRateUpdate && columnsInfo.hasAccrualRate) setParts.push(`accrual_rate = ${addParam(Number(accrualRate.toFixed(2)))}`);
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
