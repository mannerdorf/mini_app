import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { getEmailSettings } from "../lib/sendRegistrationEmail.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * POST /api/admin-email-test
 * Тестирует SMTP-подключение по настройкам из env Vercel (или переданным в body).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const ctx = initRequestContext(req, res, "admin-email-test");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  let body: {
    smtp_host?: string;
    smtp_port?: number;
    smtp_user?: string;
    smtp_password?: string;
    from_email?: string;
  } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  try {
    const settings = await getEmailSettings();

    const host = typeof body?.smtp_host === "string" && body.smtp_host.trim()
      ? body.smtp_host.trim()
      : settings.smtp_host;
    const port = typeof body?.smtp_port === "number"
      ? body.smtp_port
      : body?.smtp_port != null
        ? parseInt(String(body.smtp_port), 10)
        : settings.smtp_port || 587;
    const user = typeof body?.smtp_user === "string" && body.smtp_user.trim()
      ? body.smtp_user.trim()
      : settings.smtp_user;
    const password = typeof body?.smtp_password === "string" && body.smtp_password.trim()
      ? body.smtp_password.trim()
      : settings.smtp_password;

    if (!host) {
      return res.status(400).json({ ok: false, error: "Укажите SMTP хост", request_id: ctx.requestId });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: port === 465,
      auth: user && password ? { user, pass: password } : undefined,
    });

    await transporter.verify();
    return res.status(200).json({ ok: true, message: "Подключение успешно", request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_email_test_failed", err);
    return res.status(200).json({
      ok: false,
      error: err?.message || "Ошибка подключения",
      request_id: ctx.requestId,
    });
  }
}
