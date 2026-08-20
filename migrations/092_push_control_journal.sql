-- Журнал контроля push: пользователь / ИНН заказчика / устройство / тип события.
-- push_control_journal — история действий (подписка, отписка, смена настроек).
-- push_activation — актуальный реестр «что включено» для автопушей (login + inn + event).

create table if not exists push_control_journal (
  id bigserial primary key,
  login text not null,
  inn text not null default '',
  action text not null,
  channel text not null default 'push',
  event_id text,
  enabled boolean,
  device_token_suffix text,
  platform text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists push_control_journal_login_created_idx
  on push_control_journal (lower(trim(login)), created_at desc);

create index if not exists push_control_journal_inn_created_idx
  on push_control_journal (inn, created_at desc)
  where inn <> '';

create index if not exists push_control_journal_action_created_idx
  on push_control_journal (action, created_at desc);

comment on table push_control_journal is
  'Журнал подписок FCM и изменений настроек push (login / ИНН / устройство / тип события)';

create table if not exists push_activation (
  login text not null,
  inn text not null,
  event_id text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (login, inn, event_id)
);

create index if not exists push_activation_inn_enabled_idx
  on push_activation (inn, event_id)
  where enabled = true;

create index if not exists push_activation_login_idx
  on push_activation (lower(trim(login)));

comment on table push_activation is
  'Актуальный контроль автопушей: логин + ИНН заказчика + тип события (вкл/выкл)';
