-- Нормализованный кэш документов: одна строка на документ вместо jsonb-массива в id=1.
-- Индексы по doc_date и customer_inn ускоряют выборку по периоду для дашборда и API.

create table if not exists cache_perevozki_rows (
  item_key text primary key,
  doc_date date,
  doc_date_vr date,
  doc_number text,
  customer_inn text,
  sender_inn text,
  receiver_inn text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_cache_perevozki_rows_doc_date
  on cache_perevozki_rows (doc_date);

create index if not exists idx_cache_perevozki_rows_doc_date_vr
  on cache_perevozki_rows (doc_date_vr)
  where doc_date_vr is not null;

create index if not exists idx_cache_perevozki_rows_customer_inn_date
  on cache_perevozki_rows (customer_inn, doc_date);

create index if not exists idx_cache_perevozki_rows_doc_number
  on cache_perevozki_rows (doc_number)
  where doc_number is not null and doc_number <> '';

create table if not exists cache_invoices_rows (
  item_key text primary key,
  doc_date date,
  doc_number text,
  customer_inn text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_cache_invoices_rows_doc_date
  on cache_invoices_rows (doc_date);

create index if not exists idx_cache_invoices_rows_customer_inn_date
  on cache_invoices_rows (customer_inn, doc_date);

create index if not exists idx_cache_invoices_rows_doc_number
  on cache_invoices_rows (doc_number)
  where doc_number is not null and doc_number <> '';

create table if not exists cache_acts_rows (
  item_key text primary key,
  doc_date date,
  doc_number text,
  customer_inn text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_cache_acts_rows_doc_date
  on cache_acts_rows (doc_date);

create index if not exists idx_cache_acts_rows_customer_inn_date
  on cache_acts_rows (customer_inn, doc_date);

create table if not exists cache_sendings_rows (
  item_key text primary key,
  doc_date date,
  doc_number text,
  customer_inn text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_cache_sendings_rows_doc_date
  on cache_sendings_rows (doc_date);

create index if not exists idx_cache_sendings_rows_customer_inn_date
  on cache_sendings_rows (customer_inn, doc_date);

create table if not exists document_cache_normalized_state (
  kind text primary key,
  row_count bigint not null default 0,
  migrated_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into document_cache_normalized_state (kind, row_count)
values
  ('perevozki', 0),
  ('invoices', 0),
  ('acts', 0),
  ('sendings', 0)
on conflict (kind) do nothing;
