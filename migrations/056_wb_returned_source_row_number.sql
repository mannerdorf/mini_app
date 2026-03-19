-- Номер строки в исходном Excel при импорте возвратного груза
alter table wb_returned_items
  add column if not exists source_row_number int;

comment on column wb_returned_items.source_row_number is '1-based номер строки в файле импорта (Excel)';
