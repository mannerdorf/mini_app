import nodemailer from "nodemailer";
import type { Pool } from "pg";
import { getAppUrl, getEmailSettings } from "./sendRegistrationEmail.js";

export async function sendTelegramActivationEmail(
  pool: Pool,
  toEmail: string,
  code6: string,
  customerLabel: string
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const settings = await getEmailSettings(pool);
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

  const appUrl = getAppUrl();
  const safeCustomer = customerLabel?.trim() || "вашего аккаунта";
  const subject = "Код активации Telegram-бота HAULZ";
  const text =
    `Здравствуйте!\n\n` +
    `Запрошена активация Telegram-бота HAULZ для ${safeCustomer}.\n` +
    `Ваш код подтверждения: ${code6}\n\n` +
    `Если это были не вы, просто проигнорируйте письмо.\n\n` +
    `Войти в HAULZ: ${appUrl}\n\nКоманда HAULZ`;

  const html =
    `<p>Здравствуйте!</p>` +
    `<p>Запрошена активация Telegram-бота HAULZ для <strong>${escapeHtml(safeCustomer)}</strong>.</p>` +
    `<p>Ваш код подтверждения: <strong style="font-size:18px">${escapeHtml(code6)}</strong></p>` +
    `<p>Если это были не вы, просто проигнорируйте письмо.</p>` +
    `<p>Войти в HAULZ: <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>` +
    `<p>Команда HAULZ</p>`;

  try {
    const info = await transporter.sendMail({
      from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
      to: toEmail,
      subject,
      text,
      html,
    });
    const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted as string[] : [];
    const rejected = Array.isArray((info as any)?.rejected) ? (info as any).rejected as string[] : [];
    if (accepted.length === 0 || rejected.includes(toEmail)) {
      return { ok: false, error: `SMTP rejected recipient: ${toEmail}` };
    }
    return { ok: true, messageId: (info as any)?.messageId ? String((info as any).messageId) : undefined };
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
