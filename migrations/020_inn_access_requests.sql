-- Запросы доступа к компании по ИНН: код подтверждения отправляется на email из справочника заказчиков
create table if not exists inn_access_requests (
  id serial primary key,
  inn text not null,
  requester_login text not null,
  code_6 text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists inn_access_requests_inn_login_idx on inn_access_requests(inn, requester_login);
create index if not exists inn_access_requests_expires_idx on inn_access_requests(expires_at);
