import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

/**
 * POST /api/verify-admin-access
 * Body: { login: string, password: string }
 *
 * Вход в админку (CMS):
 * 1) Сначала проверка по ADMIN_LOGIN и ADMIN_PASSWORD из env.
 * 2) Если не совпало — проверка по БД: пользователь из registered_users с правом cms_access и верный пароль.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: { login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  // Форма может отправлять login или email — оба подходят
  const loginRaw = typeof body?.login === "string" ? body.login : (typeof body?.email === "string" ? body.email : "");
  const login = loginRaw.trim();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!login || !password) {
    return res.status(400).json({ error: "Войдите в аккаунт для доступа в админку" });
  }

  const loginLower = login.toLowerCase();

  // 1) Доступ по env (логин/пароль администратора из Vercel)
  const adminLogin = process.env.ADMIN_LOGIN?.trim() ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (adminLogin && adminPassword && loginLower === adminLogin.toLowerCase() && password === adminPassword) {
    const adminToken = createAdminToken();
    return res.status(200).json({ ok: true, adminToken });
  }

  // 2) Доступ по БД: пользователь с правом "Доступ в CMS" (cms_access)
  try {
    const pool = getPool();
    // Права: cms_access = true в jsonb (проверяем и через -> и через ->> на случай разного хранения)
    const { rows } = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM registered_users
       WHERE LOWER(TRIM(login)) = $1 AND active = true
       AND (
         (permissions->'cms_access') = 'true'::jsonb
         OR (permissions->>'cms_access') = 'true'
       )`,
      [loginLower]
    );
    const user = rows[0];
    if (user && verifyPassword(password, user.password_hash)) {
      const adminToken = createAdminToken();
      return res.status(200).json({ ok: true, adminToken });
    }
  } catch (e) {
    console.error("verify-admin-access DB check:", e);
  }

  return res.status(403).json({ error: "Доступ запрещён" });
}
