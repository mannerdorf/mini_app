-- ========== 035_pnl.sql ==========
-- P&L и Unit Economics: таблицы для финансовой аналитики.

-- Операции (транзакции)
create table if not exists pnl_operations (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  counterparty text not null,
  purpose text not null,
  amount double precision not null,
  operation_type text not null,
  department text not null,
  logistics_stage text,
  direction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pnl_operations_date_idx on pnl_operations(date);
create index if not exists pnl_operations_operation_type_idx on pnl_operations(operation_type);
create index if not exists pnl_operations_department_idx on pnl_operations(department);
create index if not exists pnl_operations_direction_idx on pnl_operations(direction);

-- Продажи
create table if not exists pnl_sales (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  client text not null,
  direction text not null,
  transport_type text,
  weight_kg double precision not null default 0,
  volume double precision,
  paid_weight_kg double precision,
  revenue double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_sales_date_idx on pnl_sales(date);
create index if not exists pnl_sales_direction_idx on pnl_sales(direction);

-- Платежи по кредитам и лизингу
create table if not exists pnl_credit_payments (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  counterparty text not null,
  purpose text,
  amount double precision not null,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists pnl_credit_payments_date_idx on pnl_credit_payments(date);
create index if not exists pnl_credit_payments_type_idx on pnl_credit_payments(type);

-- Справочник доходов
create table if not exists pnl_income_categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  direction text not null default 'MSK_TO_KGD',
  transport_type text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Справочник расходов (PNL)
create table if not exists pnl_expense_categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  department text not null,
  type text not null default 'OPEX',
  logistics_stage text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_expense_categories_department_idx on pnl_expense_categories(department);

-- Подразделения
create table if not exists pnl_subdivisions (
  id text primary key default gen_random_uuid()::text,
  code text unique,
  name text not null,
  department text not null,
  logistics_stage text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_subdivisions_department_idx on pnl_subdivisions(department);

-- Ручной ввод дохода за период
create table if not exists pnl_manual_revenues (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  category_id text not null references pnl_income_categories(id) on delete cascade,
  amount double precision not null,
  direction text not null default '',
  transport_type text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists pnl_manual_revenues_uniq
  on pnl_manual_revenues(period, category_id, direction, transport_type);
create index if not exists pnl_manual_revenues_period_idx on pnl_manual_revenues(period);

-- Ручной ввод расхода за период
create table if not exists pnl_manual_expenses (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  category_id text not null references pnl_expense_categories(id) on delete cascade,
  amount double precision not null,
  comment text,
  direction text not null default '',
  transport_type text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists pnl_manual_expenses_uniq
  on pnl_manual_expenses(period, category_id, direction, transport_type);
create index if not exists pnl_manual_expenses_period_idx on pnl_manual_expenses(period);

-- Свод расходов из выписки
create table if not exists pnl_statement_expenses (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  counterparty text not null,
  total_amount double precision not null,
  operations_count int not null default 0,
  accounted boolean not null default false,
  category_id text references pnl_expense_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pnl_statement_expenses_uniq
  on pnl_statement_expenses(period, counterparty);
create index if not exists pnl_statement_expenses_period_idx on pnl_statement_expenses(period);
create index if not exists pnl_statement_expenses_accounted_idx on pnl_statement_expenses(accounted);

-- Правила классификации по контрагенту
create table if not exists pnl_classification_rules (
  id text primary key default gen_random_uuid()::text,
  counterparty text not null unique,
  purpose_pattern text,
  operation_type text not null,
  department text not null,
  logistics_stage text,
  direction text,
  created_at timestamptz not null default now()
);
