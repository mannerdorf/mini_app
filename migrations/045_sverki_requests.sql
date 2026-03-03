-- Заявки на формирование акта сверки от клиентов.
create table if not exists sverki_requests (
  id serial primary key,
  login text not null default '',
  customer_inn text not null default '',
  contract text not null default '',
  period_from date not null,
  period_to date not null,
  status text not null default 'pending'
    check (status in ('pending', 'edo_sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text
);

create index if not exists sverki_requests_customer_inn_idx on sverki_requests(customer_inn);
create index if not exists sverki_requests_status_idx on sverki_requests(status);
create index if not exists sverki_requests_created_at_idx on sverki_requests(created_at desc);
