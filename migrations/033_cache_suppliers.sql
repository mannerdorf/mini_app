-- Кэш поставщиков из GETAPI?metod=GETALLKontragents (ИНН, наименование, email).
-- Обновляется кроном каждые 15 минут через /api/cron/refresh-suppliers-cache.

create table if not exists cache_suppliers (
  inn text not null primary key,
  supplier_name text not null default '',
  email text default '',
  fetched_at timestamptz not null default now()
);

create index if not exists cache_suppliers_supplier_name_idx on cache_suppliers(supplier_name);
create index if not exists cache_suppliers_email_idx on cache_suppliers(email);
