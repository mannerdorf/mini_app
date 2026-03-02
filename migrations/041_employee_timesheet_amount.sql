-- Сумма начисления по строке табеля — сохраняется при записи, чтобы PnL брал данные без пересчёта.
alter table employee_timesheet_entries add column if not exists amount numeric(12, 2);
