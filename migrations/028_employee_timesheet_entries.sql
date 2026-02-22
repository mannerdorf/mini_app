-- Табель сотрудников: хранение помесячных значений по дням.
create table if not exists employee_timesheet_entries (
  id bigserial primary key,
  employee_id bigint not null references registered_users(id) on delete cascade,
  work_date date not null,
  value_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists employee_timesheet_entries_work_date_idx
  on employee_timesheet_entries(work_date);

create index if not exists employee_timesheet_entries_employee_id_idx
  on employee_timesheet_entries(employee_id);
