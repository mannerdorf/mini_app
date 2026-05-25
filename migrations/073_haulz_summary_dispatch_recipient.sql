-- Получатели массовой рассылки «Самери» (статус по каждому адресу).
create table if not exists haulz_summary_dispatch_recipient (
  id bigserial primary key,
  dispatch_log_id bigint not null references haulz_summary_dispatch_log(id) on delete cascade,
  target_login text not null default '',
  inn text not null default '',
  company_name text not null default '',
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  error text,
  message_id text,
  sent_at timestamptz,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (dispatch_log_id, target_login, inn)
);

create index if not exists haulz_summary_dispatch_recipient_log_idx
  on haulz_summary_dispatch_recipient (dispatch_log_id, sort_order);

create index if not exists haulz_summary_dispatch_recipient_status_idx
  on haulz_summary_dispatch_recipient (dispatch_log_id, status);
