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
      });
    }

    let body: {
      smtp_host?: string;
      smtp_port?: number;
      smtp_user?: string;
      smtp_password?: string;
      from_email?: string;
      from_name?: string;
    } = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const smtpHost = typeof body?.smtp_host === "string" ? body.smtp_host.trim() : null;
    const smtpPort = typeof body?.smtp_port === "number" ? body.smtp_port : null;
    const smtpUser = typeof body?.smtp_user === "string" ? body.smtp_user.trim() : null;
    const smtpPassword = typeof body?.smtp_password === "string" && body.smtp_password.trim()
      ? Buffer.from(body.smtp_password.trim()).toString("base64")
      : null;
    const fromEmail = typeof body?.from_email === "string" ? body.from_email.trim() : null;
    const fromName = typeof body?.from_name === "string" ? body.from_name.trim() : null;

    if (smtpPassword) {
      await pool.query(
        `UPDATE admin_email_settings SET
          smtp_host = COALESCE($1, smtp_host), smtp_port = COALESCE($2, smtp_port),
          smtp_user = COALESCE($3, smtp_user), smtp_password_encrypted = $4,
          from_email = COALESCE($5, from_email), from_name = COALESCE($6, from_name),
          updated_at = now() WHERE id = 1`,
        [smtpHost, smtpPort, smtpUser, smtpPassword, fromEmail, fromName]
      );
    } else {
      await pool.query(
        `UPDATE admin_email_settings SET
          smtp_host = COALESCE($1, smtp_host), smtp_port = COALESCE($2, smtp_port),
          smtp_user = COALESCE($3, smtp_user),
          from_email = COALESCE($4, from_email), from_name = COALESCE($5, from_name),
          updated_at = now() WHERE id = 1`,
        [smtpHost, smtpPort, smtpUser, fromEmail, fromName]
      );
    }

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-email-settings error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка" });
  }
}
