-- ========== 038_sync_expense_categories_to_pnl.sql ==========
-- Синхронизация текущих статей из expense_categories в pnl_expense_categories.
-- Гарантирует, что все статьи из заявок на расходы есть в Справочнике расходов (P&L).

-- Дополняем pnl_expense_categories статьями из expense_categories, которых ещё нет
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
where e.active = true
  and not exists (
    select 1 from pnl_expense_categories p
    where p.expense_category_id = e.id
      and p.department = s.department
      and (p.logistics_stage is null and s.logistics_stage is null or p.logistics_stage = s.logistics_stage)
  );
