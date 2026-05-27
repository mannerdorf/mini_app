-- Статус контрагента из GETALLKontragents (например IsMyCounteragent — работа по ЭДО).

alter table cache_suppliers
  add column if not exists counterparty_status text not null default '';

create index if not exists cache_suppliers_counterparty_status_idx
  on cache_suppliers (counterparty_status)
  where counterparty_status <> '';
