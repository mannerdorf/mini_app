-- Журнал массовых рассылок «Самери»
create table if not exists haulz_summary_dispatch_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  trigger text not null default 'auto',
  status text not null default 'running',
  period_from date not null,
  period_to date not null,
  criteria jsonb not null default '{}'::jsonb,
  recipients_total int not null default 0,
  unique_users int not null default 0,
  unique_companies int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped_unsubscribed int not null default 0,
  cursor_pos int not null default 0,
  reason_breakdown jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists haulz_summary_dispatch_log_started_at_idx
  on haulz_summary_dispatch_log (started_at desc);
