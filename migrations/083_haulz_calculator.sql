-- ========== 083_haulz_calculator.sql ==========
-- HAULZ калькулятор доставки: версионные тарифы, кольцевые съезды/полигон, кэш 2GIS.

create table if not exists haulz_calc_tariff_sets (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  block text not null check (block in ('pickup', 'mainline', 'last_mile', 'extra', 'settings')),
  direction text check (direction is null or direction in ('mow_kgd', 'kgd_mow', 'moscow', 'kaliningrad')),
  created_at timestamptz not null default now()
);

create index if not exists haulz_calc_tariff_sets_block_idx on haulz_calc_tariff_sets(block);

create table if not exists haulz_calc_tariff_versions (
  id bigserial primary key,
  tariff_set_id bigint not null references haulz_calc_tariff_sets(id) on delete cascade,
  effective_from date not null,
  payload jsonb not null default '{}'::jsonb,
  comment text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tariff_set_id, effective_from)
);

create index if not exists haulz_calc_tariff_versions_set_from_idx
  on haulz_calc_tariff_versions(tariff_set_id, effective_from desc);

comment on table haulz_calc_tariff_versions is 'История тарифов калькулятора; новая цена = новая строка';

create table if not exists haulz_calc_ring_exits (
  id bigserial primary key,
  city_code text not null check (city_code in ('moscow', 'kaliningrad')),
  code text,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists haulz_calc_ring_exits_city_active_idx
  on haulz_calc_ring_exits(city_code, active, sort_order);

create table if not exists haulz_calc_ring_polygon (
  id bigserial primary key,
  city_code text not null check (city_code in ('moscow', 'kaliningrad')),
  seq int not null,
  lat double precision not null,
  lon double precision not null,
  unique (city_code, seq)
);

create index if not exists haulz_calc_ring_polygon_city_seq_idx
  on haulz_calc_ring_polygon(city_code, seq);

create table if not exists haulz_calc_api_cache (
  cache_key text primary key,
  kind text not null check (kind in ('suggest', 'geocode', 'routing')),
  response jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists haulz_calc_api_cache_expires_idx on haulz_calc_api_cache(expires_at);
