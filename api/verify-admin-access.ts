import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";

/**
 * POST /api/verify-admin-access
 * Body: { login: string, password: string }
 * Проверяет логин и пароль текущего пользователя приложения.
 * Если совпадают с ADMIN_LOGIN и ADMIN_PASSWORD — возвращает adminToken для доступа к админке.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminLogin = process.env.ADMIN_LOGIN?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminLogin || !adminPassword) {
    return res.status(500).json({ error: "Админка не настроена (ADMIN_LOGIN, ADMIN_PASSWORD)" });
  }

  let body: { login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const login = typeof body?.login === "string" ? body.login.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!login || !password) {
    return res.status(400).json({ error: "Войдите в аккаунт для доступа в админку" });
  }

  if (login.toLowerCase() === adminLogin.toLowerCase() && password === adminPassword) {
    const adminToken = createAdminToken();
    return res.status(200).json({ ok: true, adminToken });
  }

  return res.status(403).json({ error: "Доступ запрещён" });
}
