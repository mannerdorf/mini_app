-- Настройки автоматической рассылки «Самери» (партнёрская сводка)
create table if not exists haulz_summary_cron_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  schedule text not null default 'weekly',
  period_mode text not null default 'prev_week',
  period_days int not null default 7,
  criteria jsonb not null default '{"acceptance":true,"delivery":true,"unpaid_invoices":true}'::jsonb,
  last_run_at timestamptz,
  last_run_status text,
  last_run_summary jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into haulz_summary_cron_config (id) values (1) on conflict (id) do nothing;
