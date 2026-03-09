import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword, hashPassword } from "../lib/passwordUtils.js";
import { getClientIp, isRateLimited, AUTH_CHANGE_PASSWORD_LIMIT } from "../lib/rateLimit.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * POST /api/change-password
 * Body: { login: string, currentPassword: string, newPassword: string }
 * Меняет пароль зарегистрированного пользователя (registered_users). Требует текущий пароль.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "change-password");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const ip = getClientIp(req);
  if (isRateLimited("auth_change_password", ip, AUTH_CHANGE_PASSWORD_LIMIT)) {
    return res.status(429).json({ error: "Слишком много попыток. Подождите минуту.", request_id: ctx.requestId });
  }

  let body: { login?: string; currentPassword?: string; newPassword?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!login || !currentPassword || !newPassword) {
    return res.status(400).json({ error: "Введите текущий и новый пароль", request_id: ctx.requestId });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Новый пароль не менее 8 символов", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ id: number; password_hash: string }>(
      "SELECT id, password_hash FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
      [login]
    );
    const user = rows[0];
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Неверный текущий пароль", request_id: ctx.requestId });
    }

    const newHash = hashPassword(newPassword);
    await pool.query("UPDATE registered_users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      newHash,
      user.id,
    ]);
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "change_password_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка смены пароля", request_id: ctx.requestId });
  }
}
