-- 1. БЗ пуша: заказчик (login) / канал (telegram | web) / событие (accepted, in_transit, delivered, bill_created, bill_paid, daily_summary) / вкл или выкл

create table if not exists notification_preferences (
  login text not null,
  channel text not null check (channel in ('telegram', 'web')),
  event_id text not null check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_created', 'bill_paid', 'daily_summary')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (login, channel, event_id)
);

create index if not exists notification_preferences_login_idx on notification_preferences(login);
create index if not exists notification_preferences_enabled_idx on notification_preferences(login, channel) where enabled = true;

comment on table notification_preferences is 'Настройки пуша: кому (login), каким каналом (telegram/web), по каким событиям (вкл/выкл)';
