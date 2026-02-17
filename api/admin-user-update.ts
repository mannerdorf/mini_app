import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getClientIp, isRateLimited, ADMIN_API_LIMIT } from "../lib/rateLimit.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  const ip = getClientIp(req);
  if (isRateLimited("admin_api", ip, ADMIN_API_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов. Подождите минуту." });
  }

  const id = typeof req.query.id === "string" ? parseInt(req.query.id, 10) : NaN;
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: "Некорректный id" });
  }

  let body: {
    inn?: string;
    company_name?: string;
    customers?: { inn: string; name?: string }[];
    permissions?: Record<string, boolean>;
    financial_access?: boolean;
    access_all_inns?: boolean;
    active?: boolean;
    reset_password?: boolean;
    send_password_to_email?: boolean;
    delete_profile?: boolean;
    login?: string;
  } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  try {
    const pool = getPool();
    const { rows: existing } = await pool.query<{ login: string; inn: string; company_name: string; active: boolean }>(
      "SELECT login, inn, company_name, active FROM registered_users WHERE id = $1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    const { login, inn: oldInn } = existing[0]!;

    if (body?.delete_profile === true) {
      const payload = getAdminTokenPayload(getAdminTokenFromRequest(req));
      if (payload?.superAdmin !== true) {
        return res.status(403).json({ error: "Удаление профиля доступно только суперадминистратору" });
      }
      // Мягкое удаление: деактивируем профиль, чтобы можно было восстановить.
      const { rowCount } = await pool.query("UPDATE registered_users SET active = false, updated_at = now() WHERE id = $1", [id]);
      if ((rowCount ?? 0) > 0) {
        await writeAuditLog(pool, {
          action: "user_archived",
          target_type: "user",
          target_id: id,
          details: { login, was_active: existing[0]?.active === true },
        });
        return res.status(200).json({ ok: true, archived: true, deleted: false });
      }
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const newLogin = typeof body?.login === "string" ? body.login.trim().toLowerCase() : undefined;
    if (newLogin !== undefined) {
      if (newLogin.length === 0) {
        return res.status(400).json({ error: "Укажите новый логин (email)" });
      }
      const { rows: conflict } = await pool.query<{ id: number }>(
        "SELECT id FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND id != $2",
        [newLogin, id]
      );
      if (conflict.length > 0) {
        return res.status(400).json({ error: "Пользователь с таким логином уже существует" });
      }
      await pool.query("UPDATE account_companies SET login = $1 WHERE login = $2", [newLogin, login]);
      await pool.query("UPDATE registered_users SET login = $1, updated_at = now() WHERE id = $2", [newLogin, id]);
      await writeAuditLog(pool, {
        action: "user_update",
        target_type: "user",
        target_id: id,
        details: { login_change: true, old_login: login, new_login: newLogin },
      });
      return res.status(200).json({ ok: true, login: newLogin });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let vi = 1;

    if (body?.permissions && typeof body.permissions === "object") {
      updates.push(`permissions = $${vi++}`);
      values.push(JSON.stringify(body.permissions));
    }
    if (typeof body?.financial_access === "boolean") {
      updates.push(`financial_access = $${vi++}`);
      values.push(body.financial_access);
    }
    if (typeof body?.active === "boolean") {
      updates.push(`active = $${vi++}`);
      values.push(body.active);
    }
    if (typeof body?.access_all_inns === "boolean") {
      updates.push(`access_all_inns = $${vi++}`);
      values.push(body.access_all_inns);
    }

    const customers = Array.isArray(body?.customers) ? body.customers : undefined;
    const firstCustomer = customers && customers.length > 0 ? customers[0] : null;
    const newInn = firstCustomer?.inn?.trim() ?? "";
    const newCompanyName = firstCustomer?.name?.trim() ?? (typeof body?.company_name === "string" ? body.company_name.trim() : "");
    if (customers !== undefined) {
      updates.push(`inn = $${vi++}`);
      values.push(newInn);
      updates.push(`company_name = $${vi++}`);
      values.push(newCompanyName);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      values.push(id);
      await pool.query(
        `UPDATE registered_users SET ${updates.join(", ")} WHERE id = $${vi}`,
        values
      );
    }

    if (customers !== undefined) {
      await pool.query("DELETE FROM account_companies WHERE login = $1", [login]);
      if (!body?.access_all_inns && customers.length > 0) {
        for (const c of customers) {
          const inn = typeof c.inn === "string" ? c.inn.trim() : "";
          const name = (typeof c.name === "string" ? c.name.trim() : "") || newCompanyName;
          if (inn) {
            await pool.query(
              `INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3)
               ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name`,
              [login, inn, name]
            );
          }
        }
      }
    }

    let newPassword: string | undefined;
    let emailSent = false;
    let emailError: string | undefined;
    if (body?.reset_password) {
      newPassword = generatePassword(8);
      const passwordHash = hashPassword(newPassword);
      await pool.query(
        "UPDATE registered_users SET password_hash = $1, updated_at = now() WHERE id = $2",
        [passwordHash, id]
      );
      const sendToEmail = body.send_password_to_email !== false;
      if (sendToEmail) {
        const companyName = typeof body?.company_name === "string" ? body.company_name : existing[0]!.company_name;
        const sendResult = await sendRegistrationEmail(
          pool,
          login,
          login,
          newPassword,
          companyName || "",
          { isPasswordReset: true }
        );
        if (sendResult.ok) {
          emailSent = true;
        } else {
          emailError = sendResult.error;
        }
      }
    }

    await writeAuditLog(pool, {
      action: "user_update",
      target_type: "user",
      target_id: id,
      details: {
        login,
        permissions: body?.permissions !== undefined,
        financial_access: body?.financial_access !== undefined,
        active: body?.active !== undefined,
        access_all_inns: body?.access_all_inns !== undefined,
        customers: customers !== undefined,
        reset_password: body?.reset_password === true,
      },
    });

    return res.status(200).json({
      ok: true,
      ...(newPassword ? { password: newPassword, emailSent, emailError } : {}),
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-user-update error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка обновления" });
  }
}
export default withErrorLog(handler);