-- Кэш перевозок и счетов: один снимок «за все время» от сервисного аккаунта 1С.
-- Обновляется кроном раз в 15 мин. Мини-апп читает из кэша по INN из account_companies.

create table if not exists cache_perevozki (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

create table if not exists cache_invoices (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

-- Первая вставка для последующего upsert
insert into cache_perevozki (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

insert into cache_invoices (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;
