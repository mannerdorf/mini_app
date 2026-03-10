-- Кэш ПВЗ из GETAPI?metod=GETPVZ. Обновляется кроном /api/cron/refresh-pvz-cache.
create table if not exists cache_pvz (
  id serial primary key,
  ssylka text not null default '',
  naimenovanie text not null default '',
  kod_dlya_pechati text not null default '',
  gorod text not null default '',
  region text not null default '',
  vladelec_inn text not null default '',
  vladelec_naimenovanie text not null default '',
  otpravitel_poluchatel text not null default '',
  kontaktnoe_litso text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_pvz_gorod_idx on cache_pvz(gorod);
create index if not exists cache_pvz_vladelec_inn_idx on cache_pvz(vladelec_inn);
create index if not exists cache_pvz_fetched_at_idx on cache_pvz(fetched_at desc);
