import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { getEmailSettings } from "../lib/sendRegistrationEmail.js";

/** GET — текущие шаблоны (из БД или env). POST — сохранить шаблоны в БД. */
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
        email_template_registration: settings.email_template_registration ?? "",
        email_template_password_reset: settings.email_template_password_reset ?? "",
      });
    }

    let body: { email_template_registration?: string; email_template_password_reset?: string } = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const registration = typeof body?.email_template_registration === "string" ? body.email_template_registration.trim() : null;
    const reset = typeof body?.email_template_password_reset === "string" ? body.email_template_password_reset.trim() : null;

    const current = await getEmailSettings(pool);
    const regValue = registration !== null ? registration : (current.email_template_registration ?? "");
    const resValue = reset !== null ? reset : (current.email_template_password_reset ?? "");

    await pool.query(
      `INSERT INTO admin_email_settings (id, email_template_registration, email_template_password_reset, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET
         email_template_registration = EXCLUDED.email_template_registration,
         email_template_password_reset = EXCLUDED.email_template_password_reset,
         updated_at = now()`,
      [regValue || null, resValue || null]
    );

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-email-templates error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка" });
  }
}
