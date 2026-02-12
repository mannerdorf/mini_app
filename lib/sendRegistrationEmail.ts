import nodemailer from "nodemailer";
import type { Pool } from "pg";

export type EmailSettings = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  from_email: string | null;
  from_name: string | null;
};

export async function getEmailSettings(pool: Pool): Promise<EmailSettings> {
  const { rows } = await pool.query<{
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_user: string | null;
    smtp_password_encrypted: string | null;
    from_email: string | null;
    from_name: string | null;
  }>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, from_email, from_name
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
  };
}

export async function sendRegistrationEmail(
  pool: Pool,
  to: string,
  login: string,
  password: string,
  companyName: string
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

  const html = `
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

  try {
    await transporter.sendMail({
      from: settings.from_name
        ? `"${settings.from_name}" <${settings.from_email}>`
        : settings.from_email,
      to,
      subject: "Регистрация в HAULZ",
      text: `Вы зарегистрированы в HAULZ. Логин: ${login}, Пароль: ${password}`,
      html,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err?.message || "Ошибка отправки" };
  }
}
