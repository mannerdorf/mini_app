-- Журнал действий админа (изменения прав, регистрация, сброс пароля)
create table if not exists admin_audit_log (
  id serial primary key,
  action varchar(64) not null,
  target_type varchar(32) not null,
  target_id varchar(64),
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_at_idx on admin_audit_log(created_at desc);
