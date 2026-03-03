-- Кэш договоров из GETAPI?metod=GETdogovors. Обновляется кроном /api/cron/refresh-dogovors-cache.
create table if not exists cache_dogovors (
  id serial primary key,
  doc_number text not null default '',
  doc_date timestamptz,
  customer_name text not null default '',
  customer_inn text not null default '',
  title text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_dogovors_customer_inn_idx on cache_dogovors(customer_inn);
create index if not exists cache_dogovors_doc_date_idx on cache_dogovors(doc_date desc);
create index if not exists cache_dogovors_doc_number_idx on cache_dogovors(doc_number);
create index if not exists cache_dogovors_fetched_at_idx on cache_dogovors(fetched_at desc);
