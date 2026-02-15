-- Журнал запросов к API, завершившихся ошибкой или отказом (4xx, 5xx)
create table if not exists request_error_log (
  id bigserial primary key,
  path varchar(512) not null,
  method varchar(16) not null,
  status_code smallint not null,
  error_message text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists request_error_log_created_at_idx on request_error_log(created_at desc);
create index if not exists request_error_log_status_code_idx on request_error_log(status_code);
