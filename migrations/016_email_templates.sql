-- Шаблоны писем при регистрации и сбросе пароля (подстановка: [login], [password], [company_name])
alter table admin_email_settings
  add column if not exists email_template_registration text,
  add column if not exists email_template_password_reset text;
