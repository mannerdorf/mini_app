import nodemailer from "nodemailer";
import type { Pool } from "pg";
import { getEmailSettings } from "./sendRegistrationEmail.js";

/** Отправить письмо руководителю организации: логин X хочет доступ, код для подтверждения */
export async function sendInnAccessEmail(
  pool: Pool,
  toEmail: string,
  requesterLogin: string,
  code6: string,
  companyName: string
): Promise<{ ok: boolean; error?: string }> {
  const settings = getEmailSettings();
  if (!settings.smtp_host || !settings.from_email) {
    return { ok: false, error: "Настройки почты не заданы" };
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: settings.smtp_port === 465,
    auth:
      settings.smtp_user && settings.smtp_password
        ? { user: settings.smtp_user, pass: settings.smtp_password }
        : undefined,
  });
  const subject = "Запрос доступа к данным организации в HAULZ";
  const text =
    `Здравствуйте!\n\n` +
    `Логин (${requesterLogin}) хочет получить доступ к данным вашей организации${companyName ? ` «${companyName}»` : ""} в мини-приложении HAULZ.\n\n` +
    `Если вы согласны предоставить доступ, перешлите этому лицу код подтверждения: ${code6}\n\n` +
    `Если не согласны — ничего не делайте.\n\n— HAULZ`;
  const html =
    `<p>Здравствуйте!</p>` +
    `<p>Логин <strong>${escapeHtml(requesterLogin)}</strong> хочет получить доступ к данным вашей организации${companyName ? ` «${escapeHtml(companyName)}»` : ""} в мини-приложении HAULZ.</p>` +
    `<p>Если вы согласны предоставить доступ, перешлите этому лицу код подтверждения: <strong>${code6}</strong></p>` +
    `<p>Если не согласны — ничего не делайте.</p>` +
    `<p>— HAULZ</p>`;
  try {
    await transporter.sendMail({
      from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
      to: toEmail,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err?.message || "Ошибка отправки" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
