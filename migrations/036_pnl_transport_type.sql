-- ========== 036_pnl_transport_type.sql ==========
-- Добавляем transport_type в pnl_operations и pnl_classification_rules.
alter table pnl_operations add column if not exists transport_type text;
create index if not exists pnl_operations_transport_type_idx on pnl_operations(transport_type);

alter table pnl_classification_rules add column if not exists transport_type text;
