-- Подтверждённые координаты ПВЗ (забор / заявки): один раз на карте, далее переиспользуются.
create table if not exists pickup_pvz_coords (
  pvz_ref text primary key,
  city text not null default 'moscow',
  latitude double precision not null,
  longitude double precision not null,
  full_address text not null default '',
  confirmed_by text not null default '',
  confirmed_at timestamptz not null default now()
);

create index if not exists pickup_pvz_coords_city_idx on pickup_pvz_coords (city);
