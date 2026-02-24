-- Кэш заявок (источник: GetPerevozki), отдельный снимок для раздела "Заявки".
-- Обновляется кроном раз в 15 минут.

create table if not exists cache_orders (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

insert into cache_orders (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;
