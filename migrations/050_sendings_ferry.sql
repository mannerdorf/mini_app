-- Паром и ETA для строк отправок (раздел Документы -> Отправки, только паромные).
create table if not exists sendings_ferry (
  id bigserial primary key,
  login text not null,
  inn text,
  row_key text not null,
  ferry_id bigint not null references ferries(id) on delete cascade,
  eta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sendings_ferry_login_row_key_uidx
  on sendings_ferry (lower(trim(login)), row_key);

create index if not exists sendings_ferry_login_idx
  on sendings_ferry (lower(trim(login)));

comment on table sendings_ferry is 'Привязка парома и ETA к строкам паромных отправок';
comment on column sendings_ferry.eta is 'ETA судна из Marinesia (ISO datetime или текст)';
