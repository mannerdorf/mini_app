-- Кэш заказчиков из Getcustomers (ИНН, Заказчик, email). Обновляется кроном каждые 15 мин.

create table if not exists cache_customers (
  inn text not null primary key,
  customer_name text not null default '',
  email text default '',
  fetched_at timestamptz not null default now()
);

create index if not exists cache_customers_customer_name_idx on cache_customers(customer_name);
create index if not exists cache_customers_email_idx on cache_customers(email);
