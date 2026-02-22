import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";
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
  return { cols, has };
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
      employee_role: "employee" | "department_head" | null;
      active: boolean;
      invited_with_preset_label: string | null;
      created_at: string;
    }>(
      `SELECT id, login, full_name, department, employee_role, active, invited_with_preset_label, created_at
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
    const employeeRole = String(body?.employee_role || "employee").trim();
    const presetId = body?.preset_id ? parseInt(String(body.preset_id), 10) : null;
    const sendEmail = body?.send_email !== false;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Некорректный email" });
    if (!fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (!department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });

    const defaults = {
      cms_access: false,
      cargo: true,
      doc_invoices: true,
      doc_acts: true,
      doc_orders: true,
      doc_claims: true,
      doc_contracts: true,
      doc_acts_settlement: true,
      doc_tariffs: true,
      haulz: false,
      chat: true,
      service_mode: false,
      analytics: false,
      supervisor: employeeRole === "department_head",
    } as Record<string, boolean>;

    let permissions = defaults;
    let presetLabel: string | null = null;
    if (presetId && Number.isFinite(presetId)) {
      const { rows: presetRows } = await pool.query<{ label: string; permissions: Record<string, boolean> | null }>(
        "SELECT label, permissions FROM admin_role_presets WHERE id = $1",
        [presetId]
      );
      const preset = presetRows[0];
      if (!preset) return res.status(400).json({ error: "Пресет не найден" });
      presetLabel = preset.label;
      permissions = { ...defaults, ...(preset.permissions || {}) };
    }

    const password = generatePassword(8);
    const passwordHash = hashPassword(password);
    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO registered_users
          (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns, full_name, department, employee_role, invited_with_preset_label)
         VALUES ($1, $2, '', '', $3, false, false, $4, $5, $6, $7)
         RETURNING id`,
        [email, passwordHash, JSON.stringify(permissions), fullName, department, employeeRole, presetLabel]
      );
      if (sendEmail) {
        await sendRegistrationEmail(pool, email, email, password, "HAULZ");
      }
      return res.status(200).json({ ok: true, id: rows[0]?.id });
    } catch (e: any) {
      if (e?.code === "23505") return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
      return res.status(500).json({ error: e?.message || "Ошибка регистрации сотрудника" });
    }
  }

  if (req.method === "PATCH") {
    const id = parseInt(String(req.query?.id || "0"), 10);
    if (!id) return res.status(400).json({ error: "id обязателен" });
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    if (typeof body?.active !== "boolean") return res.status(400).json({ error: "active обязателен" });
    const hasUpdatedAt = columnsInfo.cols.has("updated_at");
    await pool.query(
      `UPDATE registered_users
       SET active = $1${hasUpdatedAt ? ", updated_at = now()" : ""}
       WHERE id = $2`,
      [body.active, id]
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
