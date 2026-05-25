-- Антиспам: партии и паузы для автоотправки «Отчёт»
alter table haulz_summary_cron_config
  add column if not exists batch_size int not null default 6,
  add column if not exists email_pause_sec int not null default 4,
  add column if not exists batch_pause_sec int not null default 120,
  add column if not exists spread_window_hours int not null default 4,
  add column if not exists send_job jsonb;
