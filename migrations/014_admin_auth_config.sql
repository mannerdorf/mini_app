create table if not exists admin_auth_config (
  id int primary key default 1 check (id = 1),
  api_v1 boolean not null default true,
  api_v2 boolean not null default true,
  cms boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into admin_auth_config (id) values (1) on conflict (id) do nothing;
