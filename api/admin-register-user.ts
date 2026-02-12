import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";

const DEFAULT_PERMISSIONS = {
  cms_access: false,
  cargo: true,
  doc_invoices: true,
  doc_acts: true,
  doc_orders: false,
  doc_claims: false,
  doc_contracts: false,
  doc_acts_settlement: false,
  doc_tariffs: false,
  chat: true,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  let body: {
    inn?: string;
    company_name?: string;
    email?: string;
    send_email?: boolean;
    permissions?: Record<string, boolean>;
    financial_access?: boolean;
    access_all_inns?: boolean;
  } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const accessAllInns = !!body?.access_all_inns;
  const inn = typeof body?.inn === "string" ? body.inn.trim() : "";
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const sendEmail = body?.send_email !== false;
  const permissions = body?.permissions && typeof body.permissions === "object"
    ? { ...DEFAULT_PERMISSIONS, ...body.permissions }
    : DEFAULT_PERMISSIONS;
  const financialAccess = body?.financial_access !== false;

  if (!accessAllInns && (!inn || inn.length < 10)) {
    return res.status(400).json({ error: "ИНН обязателен (10 или 12 цифр) или включите «Доступ ко всем заказчикам»" });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Некорректный email" });
  }

  const login = email;
  const password = generatePassword(8);
  const passwordHash = hashPassword(password);

  const innForDb = accessAllInns ? "" : inn;
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO registered_users (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [login, passwordHash, innForDb, companyName, JSON.stringify(permissions), financialAccess, accessAllInns]
    );

    if (!accessAllInns && inn) {
      await pool.query(
        `INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3)
         ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name`,
        [login, inn, companyName]
      );
    }

    if (sendEmail) {
      const sendResult = await sendRegistrationEmail(pool, email, login, password, companyName);
      if (!sendResult.ok) {
        return res.status(200).json({
          ok: true,
          userId: (await pool.query("SELECT id FROM registered_users WHERE login = $1", [login])).rows[0]?.id,
          login,
          password,
          emailSent: false,
          emailError: sendResult.error,
        });
      }
    }

    const { rows } = await pool.query("SELECT id FROM registered_users WHERE login = $1", [login]);
    return res.status(200).json({
      ok: true,
      userId: rows[0]?.id,
      login,
      ...(sendEmail ? {} : { password }),
      emailSent: sendEmail,
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err?.code === "23505") {
      return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован" });
    }
    console.error("admin-register-user error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка создания пользователя" });
  }
}
