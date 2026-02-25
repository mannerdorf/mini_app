-- EOR-статусы для строк отправок (раздел Документы -> Отправки)
create table if not exists sendings_eor (
  id bigserial primary key,
  login text not null,
  inn text,
  row_key text not null,
  sending_number text,
  sending_date date,
  statuses text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sendings_eor_statuses_chk check (
    statuses <@ array['entry_allowed','full_inspection','turnaround']::text[]
  )
);

create unique index if not exists sendings_eor_login_row_key_uidx
  on sendings_eor (lower(trim(login)), row_key);

create index if not exists sendings_eor_login_idx
  on sendings_eor (lower(trim(login)));

create index if not exists sendings_eor_login_updated_idx
  on sendings_eor (lower(trim(login)), updated_at desc);

create index if not exists sendings_eor_sending_number_idx
  on sendings_eor (sending_number);

comment on table sendings_eor is 'EOR-статусы для строк отправок пользователя';
comment on column sendings_eor.row_key is 'Ключ строки отправки из UI';
comment on column sendings_eor.statuses is 'entry_allowed, full_inspection, turnaround';

