-- ИНН заказчика перевозки отдельно от ИНН подписчика (скоуп login).
alter table notification_deliveries
  add column if not exists cargo_inn text;

create index if not exists notification_deliveries_cargo_inn_sent_idx
  on notification_deliveries (cargo_inn, sent_at desc)
  where cargo_inn is not null and trim(cargo_inn) <> '';

comment on column notification_deliveries.inn is
  'ИНН подписчика (скоуп login / push_activation), должен совпадать с cargo_inn';
comment on column notification_deliveries.cargo_inn is
  'ИНН заказчика перевозки из cache_perevozki_rows.customer_inn';
