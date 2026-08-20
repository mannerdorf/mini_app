-- Шаблоны push/Telegram по event_id (этапы груза, счета, сводка).
create table if not exists push_notification_templates (
  event_id text primary key,
  title_template text not null default 'HAULZ',
  body_template text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists push_notification_templates_updated_at_idx
  on push_notification_templates (updated_at desc);
