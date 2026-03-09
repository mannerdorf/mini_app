import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";
import { sendLkAddTo1c } from "../lib/sendLkTo1c.js";
import { initRequestContext, logError } from "./_lib/observability.js";

type Body = {
  login?: string;
  password?: string;
  email?: string;
  fullName?: string;
  department?: string;
  employeeRole?: "employee" | "department_head";
  presetId?: string;
  active?: boolean;
};

function parseBody(req: VercelRequest): Body {
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch {
      return {};
    }
  }
  return (b as Body) || {};
}

async function getInviterId(login: string, password: string): Promise<number | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
    [login.trim().toLowerCase()]
  );
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return row.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "my-employees");
  if (req.method === "GET" || req.method === "POST") {
    const body = parseBody(req);
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const employeeRole = body.employeeRole === "department_head" ? "department_head" : "employee";
    const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";

    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль", request_id: ctx.requestId });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }

    if (req.method === "GET" || (req.method === "POST" && !email && !presetId)) {
      try {
        const pool = getPool();
        const colsRes = await pool.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'registered_users'`
        );
        const columns = new Set(colsRes.rows.map((r) => r.column_name));
        const hasFullName = columns.has("full_name");
        const hasDepartment = columns.has("department");
        const hasEmployeeRole = columns.has("employee_role");
        const { rows } = await pool.query<{
          id: number;
          login: string;
          active: boolean;
          created_at: string;
          invited_with_preset_label: string | null;
          full_name: string | null;
          department: string | null;
          employee_role: "employee" | "department_head" | null;
        }>(
          `SELECT id, login, active, created_at, invited_with_preset_label${
            hasFullName ? ", full_name" : ", null::text as full_name"
          }${
            hasDepartment ? ", department" : ", null::text as department"
          }${
            hasEmployeeRole ? ", employee_role" : ", null::text as employee_role"
          }
           FROM registered_users WHERE invited_by_user_id = $1 ORDER BY created_at DESC`,
          [inviterId]
        );
        return res.status(200).json({
          employees: rows.map((r) => ({
            id: r.id,
            login: r.login,
            active: r.active,
            createdAt: r.created_at,
            presetLabel: r.invited_with_preset_label || "—",
            fullName: r.full_name || "",
            department: r.department || "",
            employeeRole: r.employee_role || "employee",
          })),
          request_id: ctx.requestId,
        });
      } catch (e: unknown) {
        logError(ctx, "my_employees_list_failed", e);
        return res.status(500).json({ error: "Ошибка загрузки списка", request_id: ctx.requestId });
      }
    }

    if (req.method === "POST" && email && presetId) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Укажите корректный email", request_id: ctx.requestId });
      }
      if (!fullName) {
        return res.status(400).json({ error: "Укажите ФИО", request_id: ctx.requestId });
      }
      if (!department) {
        return res.status(400).json({ error: "Укажите структурное подразделение", request_id: ctx.requestId });
      }
      try {
      const pool = getPool();
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'registered_users'`
      );
      const columns = new Set(colsRes.rows.map((r) => r.column_name));
      const presetRow = await pool.query<{ label: string; permissions: unknown; financial_access: boolean; service_mode: boolean }>(
        "SELECT label, permissions, financial_access, service_mode FROM admin_role_presets WHERE id = $1",
        [parseInt(presetId, 10)]
      );
      const preset = presetRow.rows[0];
      if (!preset) {
        return res.status(400).json({ error: "Роль не найдена", request_id: ctx.requestId });
      }
      const permissions = preset.permissions && typeof preset.permissions === "object" ? preset.permissions as Record<string, boolean> : {};
      const inviterRow = await pool.query<{ login: string; inn: string; company_name: string }>(
        "SELECT login, inn, company_name FROM registered_users WHERE id = $1",
        [inviterId]
      );
      const inviter = inviterRow.rows[0];
      if (!inviter) return res.status(500).json({ error: "Ошибка", request_id: ctx.requestId });
      const companies = await pool.query<{ inn: string; name: string }>("SELECT inn, name FROM account_companies WHERE login = $1", [inviter.login]);
      const inviterInns = [inviter.inn?.trim(), ...companies.rows.map((c) => c.inn?.trim())].filter((x): x is string => !!x);
      if (inviterInns.length > 0) {
        const placeholders = inviterInns.map((_, i) => `$${i + 1}`).join(", ");
        const dirCheck = await pool.query<{ inn: string }>(
          `SELECT inn FROM cache_customers WHERE inn IN (${placeholders}) LIMIT 1`,
          inviterInns
        );
        if (dirCheck.rows.length === 0) {
          return res.status(403).json({ error: "Приглашать сотрудников могут только пользователи, чья компания есть в справочнике заказчиков.", request_id: ctx.requestId });
        }
      } else {
        return res.status(403).json({ error: "Приглашать сотрудников могут только пользователи из справочника заказчиков. Укажите компанию (ИНН) в профиле.", request_id: ctx.requestId });
      }
      const newLogin = email;
      const newPassword = generatePassword(8);
      const passwordHash = hashPassword(newPassword);
      const firstCompany = companies.rows[0];
      const inn = firstCompany?.inn ?? inviter.inn ?? "";
      const companyName = firstCompany?.name ?? inviter.company_name ?? "";
      const accessAllInns = !!preset.service_mode;
      const insertColumns = [
        "login",
        "password_hash",
        "inn",
        "company_name",
        "permissions",
        "financial_access",
        "access_all_inns",
        "invited_by_user_id",
        "invited_with_preset_label",
      ];
      const insertValues: unknown[] = [
        newLogin,
        passwordHash,
        accessAllInns ? "" : inn,
        companyName,
        JSON.stringify(permissions),
        !!preset.financial_access,
        accessAllInns,
        inviterId,
        preset.label,
      ];
      if (columns.has("full_name")) {
        insertColumns.push("full_name");
        insertValues.push(fullName);
      }
      if (columns.has("department")) {
        insertColumns.push("department");
        insertValues.push(department);
      }
      if (columns.has("employee_role")) {
        insertColumns.push("employee_role");
        insertValues.push(employeeRole);
      }
      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", ");
      await pool.query(
        `INSERT INTO registered_users (${insertColumns.join(", ")})
         VALUES (${placeholders})`,
        insertValues
      );
      if (inn && newLogin) {
        const sendLkResult = await sendLkAddTo1c({ inn, email: newLogin });
        if (!sendLkResult.ok) {
          console.error("my-employees SendLK failed:", {
            email: newLogin,
            inn,
            status: sendLkResult.status,
            error: sendLkResult.error || sendLkResult.responseText || "unknown_error",
          });
        }
      }
      if (!accessAllInns && companies.rows.length > 0) {
        for (const c of companies.rows) {
          await pool.query(
            `INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3) ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name`,
            [newLogin, c.inn, c.name || companyName]
          );
        }
      }
      const sendResult = await sendRegistrationEmail(pool, email, newLogin, newPassword, companyName);
      return res.status(200).json({
        ok: true,
        emailSent: sendResult.ok,
        emailError: sendResult.error,
        message: sendResult.ok ? "Пароль отправлен на email" : "Пользователь создан, но письмо не отправлено",
        request_id: ctx.requestId,
      });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err?.code === "23505") {
        return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован", request_id: ctx.requestId });
      }
      logError(ctx, "my_employees_invite_failed", e);
      return res.status(500).json({ error: (err as Error)?.message || "Ошибка приглашения", request_id: ctx.requestId });
    }
    }
  }

  if (req.method === "PATCH") {
    const body = parseBody(req);
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const active = typeof body.active === "boolean" ? body.active : undefined;
    const presetIdParam = typeof body.presetId === "string" ? body.presetId.trim() : "";
    const idParam = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const id = parseInt(idParam, 10);
    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль", request_id: ctx.requestId });
    }
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: "Укажите id сотрудника", request_id: ctx.requestId });
    }
    if (active === undefined && !presetIdParam) {
      return res.status(400).json({ error: "Укажите active: true/false или presetId для смены роли", request_id: ctx.requestId });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }
    try {
      const pool = getPool();
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'registered_users'`
      );
      const columns = new Set(colsRes.rows.map((r) => r.column_name));

      let setParts: string[] = [];
      if (columns.has("updated_at")) setParts.push("updated_at = now()");
      const values: unknown[] = [];
      let paramIndex = 0;
      const addParam = (value: unknown) => {
        values.push(value);
        paramIndex += 1;
        return `$${paramIndex}`;
      };

      if (presetIdParam) {
        const presetRow = await pool.query<{ label: string; permissions: unknown; financial_access: boolean; service_mode: boolean }>(
          "SELECT label, permissions, financial_access, service_mode FROM admin_role_presets WHERE id = $1",
          [parseInt(presetIdParam, 10)]
        );
        const preset = presetRow.rows[0];
        if (!preset) {
          return res.status(400).json({ error: "Роль не найдена", request_id: ctx.requestId });
        }
        const permissions = preset.permissions && typeof preset.permissions === "object" ? (preset.permissions as Record<string, boolean>) : {};
        const accessAllInns = !!preset.service_mode;
        if (!columns.has("permissions")) {
          return res.status(500).json({ error: "Конфигурация БД: отсутствует колонка permissions", request_id: ctx.requestId });
        }
        setParts.push(`permissions = ${addParam(JSON.stringify(permissions))}`);
        if (columns.has("financial_access")) {
          setParts.push(`financial_access = ${addParam(!!preset.financial_access)}`);
        }
        if (columns.has("access_all_inns")) {
          setParts.push(`access_all_inns = ${addParam(accessAllInns)}`);
        }
        if (columns.has("invited_with_preset_label")) {
          setParts.push(`invited_with_preset_label = ${addParam(preset.label)}`);
        }
        if (!accessAllInns) {
          const inviterRow = await pool.query<{ inn: string }>("SELECT inn FROM registered_users WHERE id = $1", [inviterId]);
          const inviterInn = inviterRow.rows[0]?.inn ?? "";
          const companies = await pool.query<{ inn: string }>("SELECT inn FROM account_companies WHERE login = (SELECT login FROM registered_users WHERE id = $1) ORDER BY inn LIMIT 1", [inviterId]);
          const firstInn = companies.rows[0]?.inn ?? inviterInn;
          if (columns.has("inn")) {
            setParts.push(`inn = ${addParam(firstInn)}`);
          }
        }
      }

      if (active !== undefined) {
        if (!columns.has("active")) {
          return res.status(500).json({ error: "Конфигурация БД: отсутствует колонка active", request_id: ctx.requestId });
        }
        setParts.push(`active = ${addParam(active)}`);
      }

      if (setParts.length === 0) {
        return res.status(500).json({ error: "Нет доступных полей для обновления", request_id: ctx.requestId });
      }

      const whereId = addParam(id);
      const whereInviter = addParam(inviterId);
      const result = await pool.query(
        `UPDATE registered_users SET ${setParts.join(", ")} WHERE id = ${whereId} AND invited_by_user_id = ${whereInviter}`,
        values
      );
      const rowCount = result.rowCount ?? 0;
      if (rowCount === 0) {
        return res.status(404).json({ error: "Сотрудник не найден или доступ запрещён", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch (e: unknown) {
      logError(ctx, "my_employees_patch_failed", e);
      return res.status(500).json({ error: "Ошибка обновления", request_id: ctx.requestId });
    }
  }

  if (req.method === "DELETE") {
    const body = parseBody(req);
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const idParam = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const id = parseInt(idParam, 10);
    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль", request_id: ctx.requestId });
    }
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: "Укажите id сотрудника", request_id: ctx.requestId });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        "DELETE FROM registered_users WHERE id = $1 AND invited_by_user_id = $2",
        [id, inviterId]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Сотрудник не найден или доступ запрещён", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, deleted: true, request_id: ctx.requestId });
    } catch (e: unknown) {
      logError(ctx, "my_employees_delete_failed", e);
      return res.status(500).json({ error: "Ошибка удаления", request_id: ctx.requestId });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}
