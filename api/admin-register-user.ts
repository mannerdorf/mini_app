import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { getClientIp, isRateLimited, ADMIN_API_LIMIT } from "../lib/rateLimit.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
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
  service_mode: false,
  analytics: false,
  supervisor: false,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  const ip = getClientIp(req);
  if (isRateLimited("admin_api", ip, ADMIN_API_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов. Подождите минуту." });
  }

  const WEAK_PASSWORDS = new Set(["123", "1234", "12345", "123456", "1234567", "12345678", "password", "qwerty", "admin", "letmein"]);
  function isPasswordStrongEnough(p: string): { ok: boolean; error?: string } {
    if (p.length < 8) return { ok: false, error: "Минимум 8 символов" };
    if (WEAK_PASSWORDS.has(p.toLowerCase())) return { ok: false, error: "Пароль слишком простой" };
    if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return { ok: false, error: "Нужны буквы и цифры" };
    return { ok: true };
  }

  let body: {
    inn?: string;
    company_name?: string;
    email?: string;
    send_email?: boolean;
    password?: string;
    permissions?: Record<string, boolean>;
    financial_access?: boolean;
    access_all_inns?: boolean;
    customers?: { inn?: string; name?: string }[];
  } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const accessAllInns = !!body?.access_all_inns;
  const definedCustomers =
    Array.isArray(body?.customers) && body.customers.length > 0
      ? body.customers
          .map((c) => ({
            inn: typeof c?.inn === "string" ? c.inn.trim() : "",
            name: typeof c?.name === "string" ? c.name.trim() : "",
          }))
          .filter((c) => c.inn)
      : [];
  const fallbackInn = typeof body?.inn === "string" ? body.inn.trim() : "";
  const fallbackCompanyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  const primaryCustomer = definedCustomers[0];
  const inn = primaryCustomer?.inn || fallbackInn;
  const companyName = primaryCustomer?.name || fallbackCompanyName;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
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
  const sendEmail = body?.send_email !== false;
  const manualPassword = typeof body?.password === "string" ? body.password : "";
  let password: string;
  if (!sendEmail && manualPassword) {
    const strong = isPasswordStrongEnough(manualPassword);
    if (!strong.ok) {
      return res.status(400).json({ error: strong.error || "Пароль слишком простой" });
    }
    password = manualPassword;
  } else {
    password = generatePassword(8);
  }
  const passwordHash = hashPassword(password);

  const innForDb = accessAllInns ? "" : inn;
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO registered_users (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [login, passwordHash, innForDb, companyName, JSON.stringify(permissions), financialAccess, accessAllInns]
    );

    if (!accessAllInns) {
      const customersToInsert = definedCustomers.length
        ? definedCustomers
        : inn
        ? [{ inn, name: companyName }]
        : [];
      for (const cust of customersToInsert) {
        await pool.query(
          `INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3)
           ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name`,
          [login, cust.inn, cust.name || companyName]
        );
      }
    }

    const { rows: idRows } = await pool.query<{ id: number }>("SELECT id FROM registered_users WHERE login = $1", [login]);
    const newId = idRows[0]?.id;
    await writeAuditLog(pool, { action: "user_register", target_type: "user", target_id: newId, details: { login } });

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
