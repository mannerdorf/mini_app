-- API-ключи пользователей (профиль → раздел API): префикс haulz_<public_id>_<secret>, в БД только public_id и хэш секрета.

create table if not exists user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_login text not null,
  label text not null default '',
  public_id text not null unique,
  secret_hash text not null,
  scopes text[] not null default '{}',
  allowed_inns text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists user_api_keys_user_login_active_idx
  on user_api_keys (lower(trim(user_login)))
  where revoked_at is null;

comment on table user_api_keys is 'Персональные API-ключи зарегистрированных пользователей; секрет хранится только как SHA-256 hex.';
