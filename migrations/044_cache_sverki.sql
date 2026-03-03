-- Кэш актов сверок из GETAPI?metod=GETsverki. Обновляется кроном /api/cron/refresh-sverki-cache.
create table if not exists cache_sverki (
  id serial primary key,
  doc_number text not null default '',
  doc_date timestamptz,
  period_from timestamptz,
  period_to timestamptz,
  customer_name text not null default '',
  customer_inn text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_sverki_customer_inn_idx on cache_sverki(customer_inn);
create index if not exists cache_sverki_doc_date_idx on cache_sverki(doc_date desc);
create index if not exists cache_sverki_doc_number_idx on cache_sverki(doc_number);
create index if not exists cache_sverki_fetched_at_idx on cache_sverki(fetched_at desc);
