-- Кэш тарифов из GETAPI?metod=GETTarifs. Обновляется кроном /api/cron/refresh-tariffs-cache.
create table if not exists cache_tariffs (
  id serial primary key,
  code text,
  name text not null default '',
  value numeric(18, 4),
  unit text,
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_tariffs_code_idx on cache_tariffs(code);
create index if not exists cache_tariffs_name_idx on cache_tariffs(name);
create index if not exists cache_tariffs_fetched_at_idx on cache_tariffs(fetched_at desc);
