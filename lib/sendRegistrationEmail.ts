import nodemailer from "nodemailer";
import type { Pool } from "pg";

export type EmailSettings = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  from_email: string | null;
  from_name: string | null;
  email_template_registration: string | null;
  email_template_password_reset: string | null;
};

function substituteTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (_, key) => vars[key] ?? `[${key}]`);
}

export async function getEmailSettings(pool: Pool): Promise<EmailSettings> {
  const { rows } = await pool.query<{
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_user: string | null;
    smtp_password_encrypted: string | null;
    from_email: string | null;
    from_name: string | null;
    email_template_registration: string | null;
    email_template_password_reset: string | null;
  }>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, from_email, from_name,
            email_template_registration, email_template_password_reset
     FROM admin_email_settings WHERE id = 1`
  );
  const r = rows[0];
  if (!r) {
    return {
      smtp_host: null,
      smtp_port: null,
      smtp_user: null,
      smtp_password: null,
      from_email: null,
      from_name: null,
      email_template_registration: null,
      email_template_password_reset: null,
    };
  }
  let smtp_password: string | null = null;
  if (r.smtp_password_encrypted) {
    try {
      smtp_password = Buffer.from(r.smtp_password_encrypted, "base64").toString("utf8");
    } catch {
      smtp_password = null;
    }
  }
  return {
    smtp_host: r.smtp_host,
    smtp_port: r.smtp_port,
    smtp_user: r.smtp_user,
    smtp_password,
    from_email: r.from_email,
    from_name: r.from_name || "HAULZ",
    email_template_registration: r.email_template_registration ?? null,
    email_template_password_reset: r.email_template_password_reset ?? null,
  };
}

const DEFAULT_REGISTRATION_HTML = (
  companyName: string,
  login: string,
  password: string
) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
  <p>Здравствуйте!</p>
  <p>Вы зарегистрированы в мини-приложении HAULZ${companyName ? ` для компании ${companyName}` : ""}.</p>
  <p><strong>Данные для входа:</strong></p>
  <ul>
    <li>Логин (email): <strong>${login}</strong></li>
    <li>Пароль: <strong>${password}</strong></li>
  </ul>
  <p>Рекомендуем сменить пароль при первом входе.</p>
  <p>— HAULZ</p>
</body>
</html>`;

const DEFAULT_PASSWORD_RESET_HTML = (login: string, password: string, companyName: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
  <p>Здравствуйте!</p>
  <p>Вам выдан новый временный пароль для входа в HAULZ.</p>
  <p><strong>Данные для входа:</strong></p>
  <ul>
    <li>Логин (email): <strong>${login}</strong></li>
    <li>Новый пароль: <strong>${password}</strong></li>
  </ul>
  <p>Рекомендуем сменить пароль после входа.</p>
  <p>— HAULZ</p>
</body>
</html>`;

export async function sendRegistrationEmail(
  pool: Pool,
  to: string,
  login: string,
  password: string,
  companyName: string,
  options?: { isPasswordReset?: boolean }
): Promise<{ ok: boolean; error?: string }> {
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

  const vars: Record<string, string> = {
    login,
    email: login,
    password,
    company_name: companyName || "",
  };
  const isReset = !!options?.isPasswordReset;
  let html: string;
  if (isReset && settings.email_template_password_reset) {
    html = substituteTemplate(settings.email_template_password_reset, vars);
  } else if (!isReset && settings.email_template_registration) {
    html = substituteTemplate(settings.email_template_registration, vars);
  } else if (isReset) {
    html = DEFAULT_PASSWORD_RESET_HTML(login, password, companyName);
  } else {
    html = DEFAULT_REGISTRATION_HTML(companyName, login, password);
  }
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  try {
    await transporter.sendMail({
      from: settings.from_name
        ? `"${settings.from_name}" <${settings.from_email}>`
        : settings.from_email,
      to,
      subject: "Регистрация в HAULZ",
      text,
      html,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err?.message || "Ошибка отправки" };
  }
}
