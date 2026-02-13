import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
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
    const { rows: existing } = await pool.query<{ login: string; inn: string; company_name: string }>(
      "SELECT login, inn, company_name FROM registered_users WHERE id = $1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    const { login, inn: oldInn } = existing[0]!;

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
