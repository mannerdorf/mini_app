-- Трекинг открытий и кликов в письмах «Самери»
create table if not exists haulz_summary_email_send (
  message_id text primary key,
  dispatch_log_id bigint references haulz_summary_dispatch_log(id) on delete set null,
  to_email text not null,
  target_login text,
  inn text,
  subject text,
  sent_at timestamptz not null default now(),
  open_count int not null default 0,
  click_count int not null default 0,
  first_open_at timestamptz,
  first_click_at timestamptz
);

create index if not exists haulz_summary_email_send_dispatch_log_idx
  on haulz_summary_email_send (dispatch_log_id);

create table if not exists haulz_summary_email_event (
  id bigserial primary key,
  message_id text not null references haulz_summary_email_send(message_id) on delete cascade,
  event_type text not null check (event_type in ('open', 'click')),
  link_url text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists haulz_summary_email_event_message_id_idx
  on haulz_summary_email_event (message_id, event_type);
