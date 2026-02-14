import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";
import { getClientIp, isRateLimited, ADMIN_LOGIN_LIMIT } from "../lib/rateLimit.js";

/**
 * POST /api/verify-admin-access
 * Body: { login: string, password: string }
 *
 * Вход в админку только для суперадмина из Vercel:
 * ADMIN_LOGIN и ADMIN_PASSWORD (Environment Variables в настройках проекта).
 * Пользователи из БД с правом cms_access больше не могут входить в админку.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (isRateLimited("admin_login", ip, ADMIN_LOGIN_LIMIT)) {
    return res.status(429).json({ error: "Слишком много попыток входа. Попробуйте через минуту." });
  }

  let body: { login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const loginRaw = typeof body?.login === "string" ? body.login : (typeof body?.email === "string" ? body.email : "");
  const login = loginRaw.trim();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!login || !password) {
    return res.status(400).json({ error: "Войдите в аккаунт для доступа в админку" });
  }

  const adminLogin = process.env.ADMIN_LOGIN?.trim() ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!adminLogin || !adminPassword) {
    console.error("verify-admin-access: ADMIN_LOGIN or ADMIN_PASSWORD not set in Vercel");
    return res.status(503).json({ error: "Админка не настроена (нет ADMIN_LOGIN/ADMIN_PASSWORD в Vercel)" });
  }

  const loginLower = login.toLowerCase();
  if (loginLower === adminLogin.toLowerCase() && password === adminPassword) {
    try {
      const { getPool } = await import("./_db.js");
      const { writeAuditLog } = await import("../lib/adminAuditLog.js");
      const pool = getPool();
      await writeAuditLog(pool, { action: "admin_login", target_type: "session", details: {} });
    } catch (e) {
      console.error("verify-admin-access: audit log error", e);
    }
    const adminToken = createAdminToken(true);
    return res.status(200).json({ ok: true, adminToken });
  }

  return res.status(403).json({ error: "Доступ запрещён" });
}
