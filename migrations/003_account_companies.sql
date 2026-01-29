-- Компании (заказчики по ИНН) для учёток, авторизованных через Getcustomers

create table if not exists account_companies (
  login text not null,
  inn text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (login, inn)
);

create index if not exists account_companies_login_idx on account_companies(login);
