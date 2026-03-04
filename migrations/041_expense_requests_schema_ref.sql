-- ========== 041_expense_requests_schema_ref.sql ==========
-- Справочная схема заявок на расходы.
-- Все данные хранятся в БД, localStorage не используется.
-- employee_name — ФИО сотрудника из справочника подразделения.

-- Основная таблица заявок
create table if not exists expense_requests (
  id bigserial primary key,
  uid text not null unique,
  login text not null,
  department text not null,
  doc_number text not null default '',
  doc_date date,
  period text not null default '',
  category_id text not null references expense_categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  vat_rate text not null default '',
  employee_name text not null default '',  -- ФИО сотрудника
  comment text not null default '',
  vehicle_text text,
  supplier_name text,
  supplier_inn text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'sent', 'approved', 'rejected', 'paid')),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  webhook_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Добавить колонки, если их нет (идемпотентно)
alter table expense_requests add column if not exists employee_name text not null default '';
alter table expense_requests add column if not exists supplier_name text;
alter table expense_requests add column if not exists supplier_inn text;
alter table expense_requests add column if not exists updated_at timestamptz;

comment on column expense_requests.employee_name is 'ФИО сотрудника из справочника подразделения';
