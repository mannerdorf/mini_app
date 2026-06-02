-- ========== 080_haulz_returns.sql ==========
-- HAULZ «Возвраты»: сессии, исходные файлы (bytea), результат обработки (jsonb).

create table if not exists haulz_returns_jobs (
  id bigserial primary key,
  owner_login text not null,
  title text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'ready', 'failed')),
  error_message text,
  otpravka_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists haulz_returns_jobs_owner_idx
  on haulz_returns_jobs (owner_login, created_at desc);

comment on table haulz_returns_jobs is 'Сессии обработки HAULZ Возвраты';

create table if not exists haulz_returns_files (
  id bigserial primary key,
  job_id bigint not null references haulz_returns_jobs(id) on delete cascade,
  file_role text not null check (file_role in ('otpravka', 'ul_prio1', 'ul_prio2')),
  original_filename text not null,
  mime_type text,
  file_size bigint not null default 0,
  ul_number text,
  file_data bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists haulz_returns_files_job_idx
  on haulz_returns_files (job_id);

comment on table haulz_returns_files is 'Исходные Excel-файлы отправки и УЛ (полное содержимое в bytea)';

create table if not exists haulz_returns_workbooks (
  id bigserial primary key,
  job_id bigint not null references haulz_returns_jobs(id) on delete cascade,
  version int not null default 1,
  sheets jsonb not null default '[]'::jsonb,
  itog_control_keys jsonb not null default '[]'::jsonb,
  built_at timestamptz not null default now(),
  built_by_login text not null
);

create unique index if not exists haulz_returns_workbooks_job_version_uq
  on haulz_returns_workbooks (job_id, version);

create index if not exists haulz_returns_workbooks_job_idx
  on haulz_returns_workbooks (job_id, version desc);

comment on table haulz_returns_workbooks is 'Результат обработки (листы итог, KGD, пломбы, STOP, УЛ, FIX)';
