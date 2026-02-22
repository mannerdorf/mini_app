-- Справочник сотрудников HAULZ: ФИО, подразделение и роль сотрудника.

alter table registered_users add column if not exists full_name text;
alter table registered_users add column if not exists department text;
alter table registered_users add column if not exists employee_role text
  check (employee_role in ('employee', 'department_head'));

create index if not exists registered_users_invited_by_employee_role_idx
  on registered_users(invited_by_user_id, employee_role)
  where invited_by_user_id is not null;
