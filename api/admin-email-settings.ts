import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { getEmailSettings } from "../lib/sendRegistrationEmail.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  try {
    const pool = getPool();

    if (req.method === "GET") {
      const settings = await getEmailSettings(pool);
      return res.status(200).json({
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: settings.smtp_user,
        from_email: settings.from_email,
        from_name: settings.from_name,
        has_password: !!settings.smtp_password,
        email_template_registration: settings.email_template_registration ?? "",
        email_template_password_reset: settings.email_template_password_reset ?? "",
      });
    }

    let body: {
      smtp_host?: string;
      smtp_port?: number;
      smtp_user?: string;
      smtp_password?: string;
      from_email?: string;
      from_name?: string;
      email_template_registration?: string;
      email_template_password_reset?: string;
    } = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const smtpHost = typeof body?.smtp_host === "string" ? body.smtp_host.trim() || null : null;
    const pr = body?.smtp_port;
    const smtpPort =
      typeof pr === "number" && !isNaN(pr) ? pr : typeof pr === "string" ? (parseInt(pr, 10) || null) : null;
    const smtpUser = typeof body?.smtp_user === "string" ? body.smtp_user.trim() || null : null;
    const smtpPassword = typeof body?.smtp_password === "string" && body.smtp_password.trim()
      ? Buffer.from(body.smtp_password.trim()).toString("base64")
      : null;
    const fromEmail = typeof body?.from_email === "string" ? body.from_email.trim() || null : null;
    const fromName = typeof body?.from_name === "string" ? body.from_name.trim() || null : null;
    const templateReg = typeof body?.email_template_registration === "string" ? body.email_template_registration.trim() || null : null;
    const templateReset = typeof body?.email_template_password_reset === "string" ? body.email_template_password_reset.trim() || null : null;

    // Upsert: создаём строку если нет, иначе обновляем
    if (smtpPassword) {
      await pool.query(
        `INSERT INTO admin_email_settings (id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, from_email, from_name, email_template_registration, email_template_password_reset, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (id) DO UPDATE SET
          smtp_host = COALESCE(EXCLUDED.smtp_host, admin_email_settings.smtp_host),
          smtp_port = COALESCE(EXCLUDED.smtp_port, admin_email_settings.smtp_port),
          smtp_user = COALESCE(EXCLUDED.smtp_user, admin_email_settings.smtp_user),
          smtp_password_encrypted = EXCLUDED.smtp_password_encrypted,
          from_email = COALESCE(EXCLUDED.from_email, admin_email_settings.from_email),
          from_name = COALESCE(EXCLUDED.from_name, admin_email_settings.from_name),
          email_template_registration = COALESCE(EXCLUDED.email_template_registration, admin_email_settings.email_template_registration),
          email_template_password_reset = COALESCE(EXCLUDED.email_template_password_reset, admin_email_settings.email_template_password_reset),
          updated_at = now()`,
        [smtpHost, smtpPort, smtpUser, smtpPassword, fromEmail, fromName || "HAULZ", templateReg, templateReset]
      );
    } else {
      await pool.query(
        `INSERT INTO admin_email_settings (id, smtp_host, smtp_port, smtp_user, from_email, from_name, email_template_registration, email_template_password_reset, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (id) DO UPDATE SET
          smtp_host = COALESCE(EXCLUDED.smtp_host, admin_email_settings.smtp_host),
          smtp_port = COALESCE(EXCLUDED.smtp_port, admin_email_settings.smtp_port),
          smtp_user = COALESCE(EXCLUDED.smtp_user, admin_email_settings.smtp_user),
          from_email = COALESCE(EXCLUDED.from_email, admin_email_settings.from_email),
          from_name = COALESCE(EXCLUDED.from_name, admin_email_settings.from_name),
          email_template_registration = COALESCE(EXCLUDED.email_template_registration, admin_email_settings.email_template_registration),
          email_template_password_reset = COALESCE(EXCLUDED.email_template_password_reset, admin_email_settings.email_template_password_reset),
          updated_at = now()`,
        [smtpHost, smtpPort, smtpUser, fromEmail, fromName || "HAULZ", templateReg, templateReset]
      );
    }

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-email-settings error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка" });
  }
}
