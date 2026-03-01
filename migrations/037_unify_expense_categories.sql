-- ========== 037_unify_expense_categories.sql ==========
-- Унификация справочника расходов: expense_categories — единый источник для заявок и PNL.
-- Добавляем cost_type (COGS/OPEX/CAPEX) и связь pnl_expense_categories с expense_categories.

-- Обновляем cost_type в expense_categories для существующих статей
update expense_categories set cost_type = 'COGS' where id in ('fuel', 'repair', 'spare_parts', 'mainline', 'pickup_logistics');
update expense_categories set cost_type = 'OPEX' where id in ('salary', 'office', 'rent', 'insurance', 'other');

-- Добавляем expense_category_id в pnl_expense_categories
alter table pnl_expense_categories add column if not exists expense_category_id text references expense_categories(id);

-- Сопоставление по имени для существующих записей
update pnl_expense_categories c set expense_category_id = e.id
from expense_categories e
where c.expense_category_id is null and trim(lower(c.name)) = trim(lower(e.name));

-- Подразделения (department, logistics_stage) для PNL
-- pickup_msk, warehouse_msk, mainline, warehouse_kgd, lastmile_kgd, administration, direction
insert into pnl_expense_categories (id, name, department, type, logistics_stage, expense_category_id, sort_order)
select
  gen_random_uuid()::text,
  e.name,
  s.department,
  coalesce(e.cost_type, 'OPEX'),
  s.logistics_stage,
  e.id,
  (e.sort_order * 10) + s.ord
from expense_categories e
cross join (
  values
    ('LOGISTICS_MSK', 'PICKUP', 1),
    ('LOGISTICS_MSK', 'DEPARTURE_WAREHOUSE', 2),
    ('LOGISTICS_MSK', 'MAINLINE', 3),
    ('LOGISTICS_KGD', 'ARRIVAL_WAREHOUSE', 4),
    ('LOGISTICS_KGD', 'LAST_MILE', 5),
    ('ADMINISTRATION', null, 6),
    ('DIRECTION', null, 7)
) as s(department, logistics_stage, ord)
where not exists (
  select 1 from pnl_expense_categories p
  where p.expense_category_id = e.id and p.department = s.department
    and (p.logistics_stage is null and s.logistics_stage is null or p.logistics_stage = s.logistics_stage)
);

create index if not exists pnl_expense_categories_expense_category_id_idx on pnl_expense_categories(expense_category_id);
