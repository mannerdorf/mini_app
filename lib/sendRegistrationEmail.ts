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

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
}

/** Базовые настройки из env. Шаблоны писем могут переопределяться из БД (getEmailSettings с pool). */
function getEmailSettingsFromEnv(): EmailSettings {
  const envHost = process.env.SMTP_HOST?.trim();
  if (!envHost) {
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
  const portStr = process.env.SMTP_PORT?.trim();
  const smtp_port = portStr ? parseInt(portStr, 10) || 465 : 465;
  const smtp_user = process.env.SMTP_USER?.trim() || null;
  const smtp_password = process.env.SMTP_PASSWORD?.trim() || null;
  const from_email = process.env.FROM_EMAIL?.trim() || smtp_user || null;
  const from_name = process.env.FROM_NAME?.trim() || "HAULZ";
  const email_template_registration = process.env.EMAIL_TEMPLATE_REGISTRATION?.trim() || null;
  const email_template_password_reset = process.env.EMAIL_TEMPLATE_PASSWORD_RESET?.trim() || null;
  return {
    smtp_host: envHost,
    smtp_port,
    smtp_user,
    smtp_password,
    from_email,
    from_name,
    email_template_registration,
    email_template_password_reset,
  };
}

/** Настройки почты: SMTP/from из env; шаблоны из БД (если передан pool и в таблице заданы), иначе из env. */
export async function getEmailSettings(pool?: Pool): Promise<EmailSettings> {
  const base = getEmailSettingsFromEnv();
  if (!pool) return base;
  try {
    const r = await pool.query<{ email_template_registration: string | null; email_template_password_reset: string | null }>(
      "SELECT email_template_registration, email_template_password_reset FROM admin_email_settings WHERE id = 1"
    );
    const row = r.rows[0];
    if (row) {
      if (row.email_template_registration != null && row.email_template_registration.trim() !== "") {
        base.email_template_registration = row.email_template_registration;
      }
      if (row.email_template_password_reset != null && row.email_template_password_reset.trim() !== "") {
        base.email_template_password_reset = row.email_template_password_reset;
      }
    }
  } catch {
    // таблица или колонки могут отсутствовать
  }
  return base;
}

const DEFAULT_REGISTRATION_HTML = (
  companyName: string,
  login: string,
  password: string
) => {
  const appUrl = getAppUrl();
  return `
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
  <p>Войти: <a href="${appUrl}">${appUrl}</a></p>
  <p>Рекомендуем сменить пароль при первом входе.</p>
  <p>Команда HAULZ</p>
</body>
</html>`;
};

const DEFAULT_PASSWORD_RESET_HTML = (login: string, password: string, companyName: string) => {
  const appUrl = getAppUrl();
  return `
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
  <p>Войти: <a href="${appUrl}">${appUrl}</a></p>
  <p>Рекомендуем сменить пароль после входа.</p>
  <p>Команда HAULZ</p>
</body>
</html>`;
};

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
