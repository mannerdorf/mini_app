-- ========== 040_expense_requests_supplier.sql ==========
-- Добавляем поля поставщика и расширяем хранение данных заявки для аналитики.

alter table expense_requests add column if not exists supplier_name text;
alter table expense_requests add column if not exists supplier_inn text;
