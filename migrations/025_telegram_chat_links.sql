-- Привязка Telegram-чата к аккаунту HAULZ для уведомлений и статуса активации.
create table if not exists telegram_chat_links (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  inn text,
  customer_name text,
  telegram_chat_id text not null,
  telegram_user_id text,
  chat_status text not null default 'pending' check (chat_status in ('pending', 'active', 'disabled')),
  activation_code_sent_at timestamptz,
  activated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_chat_links_login_uidx on telegram_chat_links(lower(trim(login)));
create index if not exists telegram_chat_links_chat_id_idx on telegram_chat_links(telegram_chat_id);
create index if not exists telegram_chat_links_status_idx on telegram_chat_links(chat_status);

comment on table telegram_chat_links is 'Связка Telegram chat/user с login в HAULZ и состоянием активации';
