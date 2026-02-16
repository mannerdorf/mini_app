import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";

type Body = {
  login?: string;
  password?: string;
  email?: string;
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
  if (req.method === "GET" || req.method === "POST") {
    const body = parseBody(req);
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";

    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль" });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    if (req.method === "GET" || (req.method === "POST" && !email && !presetId)) {
      try {
        const pool = getPool();
        const { rows } = await pool.query<{ id: number; login: string; active: boolean; created_at: string; invited_with_preset_label: string | null }>(
          `SELECT id, login, active, created_at, invited_with_preset_label
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
          })),
        });
      } catch (e: unknown) {
        console.error("my-employees list:", e);
        return res.status(500).json({ error: "Ошибка загрузки списка" });
      }
    }

    if (req.method === "POST" && email && presetId) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Укажите корректный email" });
      }
      try {
      const pool = getPool();
      const presetRow = await pool.query<{ label: string; permissions: unknown; financial_access: boolean; service_mode: boolean }>(
        "SELECT label, permissions, financial_access, service_mode FROM admin_role_presets WHERE id = $1",
        [parseInt(presetId, 10)]
      );
      const preset = presetRow.rows[0];
      if (!preset) {
        return res.status(400).json({ error: "Роль не найдена" });
      }
      const permissions = preset.permissions && typeof preset.permissions === "object" ? preset.permissions as Record<string, boolean> : {};
      const inviterRow = await pool.query<{ login: string; inn: string; company_name: string }>(
        "SELECT login, inn, company_name FROM registered_users WHERE id = $1",
        [inviterId]
      );
      const inviter = inviterRow.rows[0];
      if (!inviter) return res.status(500).json({ error: "Ошибка" });
      const companies = await pool.query<{ inn: string; name: string }>("SELECT inn, name FROM account_companies WHERE login = $1", [inviter.login]);
      const inviterInns = [inviter.inn?.trim(), ...companies.rows.map((c) => c.inn?.trim())].filter((x): x is string => !!x);
      if (inviterInns.length > 0) {
        const placeholders = inviterInns.map((_, i) => `$${i + 1}`).join(", ");
        const dirCheck = await pool.query<{ inn: string }>(
          `SELECT inn FROM cache_customers WHERE inn IN (${placeholders}) LIMIT 1`,
          inviterInns
        );
        if (dirCheck.rows.length === 0) {
          return res.status(403).json({ error: "Приглашать сотрудников могут только пользователи, чья компания есть в справочнике заказчиков." });
        }
      } else {
        return res.status(403).json({ error: "Приглашать сотрудников могут только пользователи из справочника заказчиков. Укажите компанию (ИНН) в профиле." });
      }
      const newLogin = email;
      const newPassword = generatePassword(8);
      const passwordHash = hashPassword(newPassword);
      const firstCompany = companies.rows[0];
      const inn = firstCompany?.inn ?? inviter.inn ?? "";
      const companyName = firstCompany?.name ?? inviter.company_name ?? "";
      const accessAllInns = !!preset.service_mode;
      await pool.query(
        `INSERT INTO registered_users (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns, invited_by_user_id, invited_with_preset_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newLogin,
          passwordHash,
          accessAllInns ? "" : inn,
          companyName,
          JSON.stringify(permissions),
          !!preset.financial_access,
          accessAllInns,
          inviterId,
          preset.label,
        ]
      );
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
      });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err?.code === "23505") {
        return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
      }
      console.error("my-employees POST invite:", e);
      return res.status(500).json({ error: (err as Error)?.message || "Ошибка приглашения" });
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
      return res.status(400).json({ error: "Укажите логин и пароль" });
    }
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: "Укажите id сотрудника" });
    }
    if (active === undefined && !presetIdParam) {
      return res.status(400).json({ error: "Укажите active: true/false или presetId для смены роли" });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    try {
      const pool = getPool();
      let setParts: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (presetIdParam) {
        const presetRow = await pool.query<{ label: string; permissions: unknown; financial_access: boolean; service_mode: boolean }>(
          "SELECT label, permissions, financial_access, service_mode FROM admin_role_presets WHERE id = $1",
          [parseInt(presetIdParam, 10)]
        );
        const preset = presetRow.rows[0];
        if (!preset) {
          return res.status(400).json({ error: "Роль не найдена" });
        }
        const permissions = preset.permissions && typeof preset.permissions === "object" ? (preset.permissions as Record<string, boolean>) : {};
        const accessAllInns = !!preset.service_mode;
        setParts.push(`permissions = $${++paramIndex}`, `financial_access = $${++paramIndex}`, `access_all_inns = $${++paramIndex}`, `invited_with_preset_label = $${++paramIndex}`);
        values.push(JSON.stringify(permissions), !!preset.financial_access, accessAllInns, preset.label);
        if (!accessAllInns) {
          const inviterRow = await pool.query<{ inn: string }>("SELECT inn FROM registered_users WHERE id = $1", [inviterId]);
          const inviterInn = inviterRow.rows[0]?.inn ?? "";
          const companies = await pool.query<{ inn: string }>("SELECT inn FROM account_companies WHERE login = (SELECT login FROM registered_users WHERE id = $1) ORDER BY inn LIMIT 1", [inviterId]);
          const firstInn = companies.rows[0]?.inn ?? inviterInn;
          setParts.push(`inn = $${++paramIndex}`);
          values.push(firstInn);
        }
      }

      if (active !== undefined) {
        setParts.push(`active = $${++paramIndex}`);
        values.push(active);
      }

      values.push(id, inviterId);
      let rowCount = 0;
      try {
        const result = await pool.query(
          `UPDATE registered_users SET ${setParts.join(", ")} WHERE id = $${++paramIndex} AND invited_by_user_id = $${++paramIndex}`,
          values
        );
        rowCount = result.rowCount ?? 0;
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        // Backward compatibility for DBs without registered_users.updated_at column.
        if (err?.code === "42703" || err?.message?.includes("updated_at")) {
          const fallbackSetParts = setParts.filter((p) => p !== "updated_at = now()");
          if (fallbackSetParts.length === 0) {
            return res.status(500).json({ error: "Ошибка обновления" });
          }
          const fallbackResult = await pool.query(
            `UPDATE registered_users SET ${fallbackSetParts.join(", ")} WHERE id = $${paramIndex - 1} AND invited_by_user_id = $${paramIndex}`,
            values
          );
          rowCount = fallbackResult.rowCount ?? 0;
        } else {
          throw e;
        }
      }
      if (rowCount === 0) {
        return res.status(404).json({ error: "Сотрудник не найден или доступ запрещён" });
      }
      return res.status(200).json({ ok: true });
    } catch (e: unknown) {
      console.error("my-employees PATCH:", e);
      return res.status(500).json({ error: "Ошибка обновления" });
    }
  }

  if (req.method === "DELETE") {
    const body = parseBody(req);
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const idParam = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const id = parseInt(idParam, 10);
    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль" });
    }
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: "Укажите id сотрудника" });
    }
    const inviterId = await getInviterId(login, password);
    if (inviterId == null) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        "DELETE FROM registered_users WHERE id = $1 AND invited_by_user_id = $2",
        [id, inviterId]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Сотрудник не найден или доступ запрещён" });
      }
      return res.status(200).json({ ok: true, deleted: true });
    } catch (e: unknown) {
      console.error("my-employees DELETE:", e);
      return res.status(500).json({ error: "Ошибка удаления" });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
