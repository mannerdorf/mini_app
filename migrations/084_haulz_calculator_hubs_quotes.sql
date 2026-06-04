-- ========== 084_haulz_calculator_hubs_quotes.sql ==========
-- Хабы/аэропорты и сохранённые расчёты калькулятора HAULZ.

create table if not exists haulz_calc_hubs (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  role text not null check (role in ('moscow', 'kaliningrad')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists haulz_calc_hubs_role_active_idx on haulz_calc_hubs(role, active);

create table if not exists haulz_calc_quotes (
  id bigserial primary key,
  login_key text not null,
  direction text not null check (direction in ('mow_kgd', 'kgd_mow')),
  request jsonb not null,
  result jsonb not null,
  tariff_snapshot jsonb not null default '{}'::jsonb,
  km_override jsonb,
  created_at timestamptz not null default now()
);

create index if not exists haulz_calc_quotes_login_created_idx
  on haulz_calc_quotes(login_key, created_at desc);

comment on table haulz_calc_hubs is 'Хабы HAULZ (аэропорты/склады) для привязки адреса';
comment on table haulz_calc_quotes is 'Сохранённые расчёты калькулятора с snapshot тарифов';
