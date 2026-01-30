-- ============================================================
-- Neon SQL Terminal: задачи для уведомлений (миграции 005 + 006)
-- Выполнить целиком в SQL Editor Neon
-- ============================================================

-- --- 005: прогоны опроса и лог доставок ---

-- Прогон опроса (раз в час)
create table if not exists notification_poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  inns_polled int not null default 0,
  notifications_sent int not null default 0,
  error_message text
);

create index if not exists notification_poll_runs_started_at_idx on notification_poll_runs(started_at desc);

-- Последнее известное состояние перевозки (дифф по заказчику)
create table if not exists cargo_last_state (
  inn text not null,
  cargo_number text not null,
  state text,
  state_bill text,
  updated_at timestamptz not null default now(),
  primary key (inn, cargo_number)
);

create index if not exists cargo_last_state_inn_idx on cargo_last_state(inn);

-- Лог: когда и кому отправили пуш, по какому каналу
create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  poll_run_id uuid references notification_poll_runs(id) on delete set null,
  login text not null,
  inn text not null,
  cargo_number text not null,
  event text not null,
  channel text not null default 'telegram',
  sent_at timestamptz not null default now(),
  telegram_chat_id text,
  success boolean not null default true,
  error_message text
);

create index if not exists notification_deliveries_poll_run_idx on notification_deliveries(poll_run_id);
create index if not exists notification_deliveries_login_sent_idx on notification_deliveries(login, sent_at desc);

-- --- 006: БЗ пуша (настройки) ---

create table if not exists notification_preferences (
  login text not null,
  channel text not null check (channel in ('telegram', 'web')),
  event_id text not null check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_paid')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (login, channel, event_id)
);

create index if not exists notification_preferences_login_idx on notification_preferences(login);
create index if not exists notification_preferences_enabled_idx on notification_preferences(login, channel) where enabled = true;

comment on table notification_preferences is 'Настройки пуша: кому (login), канал (telegram/web), событие (вкл/выкл)';
