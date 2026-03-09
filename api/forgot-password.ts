import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getClientIp, isRateLimited } from "../lib/rateLimit.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/** Лимит запросов сброса пароля с одного IP в минуту */
const FORGOT_PASSWORD_LIMIT = 5;

/**
 * POST /api/forgot-password
 * Сброс пароля по логину (email): то же, что сброс из админки — новый пароль на почту.
 * Тело: { login: "email@example.com" }
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "forgot-password");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const ip = getClientIp(req);
  if (isRateLimited("forgot_password", ip, FORGOT_PASSWORD_LIMIT)) {
    return res.status(429).json({ error: "Слишком много попыток. Подождите минуту.", request_id: ctx.requestId });
  }

  let body: { login?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!login) {
    return res.status(400).json({ error: "Введите логин (email)", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ id: number; company_name: string }>(
      "SELECT id, company_name FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
      [login]
    );
    if (rows.length === 0) {
      return res.status(200).json({ ok: false, error: "Пользователь с таким логином не найден или деактивирован", request_id: ctx.requestId });
    }

    const newPassword = generatePassword(8);
    const passwordHash = hashPassword(newPassword);
    await pool.query(
      "UPDATE registered_users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [passwordHash, rows[0]!.id]
    );

    const sendResult = await sendRegistrationEmail(
      pool,
      login,
      login,
      newPassword,
      rows[0]!.company_name || "",
      { isPasswordReset: true }
    );

    if (sendResult.ok) {
      return res.status(200).json({ ok: true, emailSent: true, request_id: ctx.requestId });
    }
    return res.status(200).json({ ok: false, error: sendResult.error || "Не удалось отправить пароль на почту", request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "forgot_password_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка сервера", request_id: ctx.requestId });
  }
}
export default withErrorLog(handler);