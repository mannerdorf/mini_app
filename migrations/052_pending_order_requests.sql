-- Заявки, созданные через «Новая заявка», ожидающие синхронизации с 1С.
create table if not exists pending_order_requests (
  id serial primary key,
  login text not null,
  inn text,
  punkt_otpravki text not null,
  punkt_naznacheniya text not null,
  nomer_zayavki text not null,
  data_zabora date not null,
  table_rows jsonb default '[]',
  created_at timestamptz not null default now()
);

create index if not exists pending_order_requests_login_idx on pending_order_requests(login);
create index if not exists pending_order_requests_created_at_idx on pending_order_requests(created_at desc);
