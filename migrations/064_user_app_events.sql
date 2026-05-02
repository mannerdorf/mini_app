-- События активности пользователей мини-приложения (входы, открытые разделы).
create table if not exists user_app_events (
  id bigserial primary key,
  user_id bigint references registered_users(id) on delete set null,
  login text not null,
  event_type varchar(64) not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_app_events_created_at_idx on user_app_events (created_at desc);
create index if not exists user_app_events_login_created_idx on user_app_events (lower(trim(login)), created_at desc);
create index if not exists user_app_events_event_type_idx on user_app_events (event_type);

comment on table user_app_events is 'Журнал действий пользователей в приложении: входы (app_login), открытие разделов (ui_section).';
