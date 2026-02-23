-- Исключение сотрудника из табеля конкретного месяца.
create table if not exists employee_timesheet_month_exclusions (
  id bigserial primary key,
  employee_id bigint not null references registered_users(id) on delete cascade,
  month_key date not null,
  created_by_user_id bigint references registered_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, month_key)
);

create index if not exists employee_timesheet_month_exclusions_month_idx
  on employee_timesheet_month_exclusions(month_key);
