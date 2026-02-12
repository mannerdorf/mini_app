-- Пользователи, зарегистрированные через админку (служебный режим)
-- Логин = email, пароль хэшируется. Вход в мини-апп по этим данным.

create table if not exists registered_users (
  id serial primary key,
  login text not null unique,
  password_hash text not null,
  inn text not null,
  company_name text not null default '',
  permissions jsonb not null default '{"cargo":true,"doc_invoices":true,"doc_acts":true,"doc_orders":false,"doc_claims":false,"doc_contracts":false,"doc_acts_settlement":false,"doc_tariffs":false,"chat":true}',
  financial_access boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registered_users_login_idx on registered_users(login);
create index if not exists registered_users_inn_idx on registered_users(inn);
create index if not exists registered_users_active_idx on registered_users(active) where active = true;

-- Настройки почты для отправки паролей и уведомлений (один набор на всю систему)
create table if not exists admin_email_settings (
  id int primary key default 1 check (id = 1),
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_password_encrypted text,
  from_email text,
  from_name text default 'HAULZ',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into admin_email_settings (id) values (1) on conflict (id) do nothing;
