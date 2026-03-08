-- Atomic notification preferences per user (single JSON row).
-- This table is used as the primary source of truth for notification settings.

create table if not exists notification_preferences_state (
  login text primary key,
  preferences jsonb not null default '{"telegram":{},"webpush":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_state_updated_idx
  on notification_preferences_state(updated_at desc);
