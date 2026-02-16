import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";
import { getClientIp, isRateLimited, ADMIN_LOGIN_LIMIT } from "../lib/rateLimit.js";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

/**
 * POST /api/verify-admin-access
 * Body: { login: string, password: string }
 *
 * Вход в админку:
 * 1) суперадмин из Vercel (ADMIN_LOGIN/ADMIN_PASSWORD) -> superAdmin token
 * 2) пользователь из БД с permissions.cms_access=true и верным паролем -> обычный admin token
 */
async function handler(req: VercelRequest, res: VercelResponse) {
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
  const loginLower = login.toLowerCase();
  const isEnvSuperAdmin =
    !!adminLogin &&
    !!adminPassword &&
    loginLower === adminLogin.toLowerCase() &&
    password === adminPassword;

  if (isEnvSuperAdmin) {
    try {
      const { writeAuditLog } = await import("../lib/adminAuditLog.js");
      const pool = getPool();
      await writeAuditLog(pool, { action: "admin_login", target_type: "session", details: { role: "super_admin" } });
    } catch (e) {
      console.error("verify-admin-access: audit log error", e);
    }
    const adminToken = createAdminToken(true);
    return res.status(200).json({ ok: true, adminToken });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      login: string;
      password_hash: string;
      permissions: Record<string, boolean> | null;
    }>(
      `SELECT id, login, password_hash, permissions
       FROM registered_users
       WHERE LOWER(TRIM(login)) = $1
         AND active = true
       LIMIT 1`,
      [loginLower]
    );

    const user = rows[0];
    const hasCmsAccess = !!user?.permissions?.cms_access;
    const validPassword = !!user && verifyPassword(password, user.password_hash);
    if (user && hasCmsAccess && validPassword) {
      try {
        const { writeAuditLog } = await import("../lib/adminAuditLog.js");
        await writeAuditLog(pool, { action: "admin_login", target_type: "session", details: { role: "cms_user", login: user.login } });
      } catch (e) {
        console.error("verify-admin-access: audit log error", e);
      }
      const adminToken = createAdminToken(false);
      return res.status(200).json({ ok: true, adminToken });
    }
  } catch (e) {
    console.error("verify-admin-access: db check error", e);
    return res.status(500).json({ error: "Ошибка проверки доступа" });
  }

  return res.status(403).json({ error: "Доступ запрещён" });
}
export default withErrorLog(handler);