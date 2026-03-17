-- ========== 053_add_expense_articles_telephony_bank_cafe_post_site.sql ==========
-- Добавляем статьи расходов: Телефония, Банк, Кафе, Почта и сайт.

insert into expense_categories (id, name, cost_type, sort_order) values
  ('telephony', 'Телефония', 'OPEX', 12),
  ('bank', 'Банк', 'OPEX', 13),
  ('cafe', 'Кафе', 'OPEX', 14),
  ('post_site', 'Почта и сайт', 'OPEX', 15)
on conflict (id) do update
set
  name = excluded.name,
  cost_type = excluded.cost_type,
  sort_order = excluded.sort_order,
  active = true;

-- Синхронизация новых статей в pnl_expense_categories по всем подразделениям/этапам.
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
where e.id in ('telephony', 'bank', 'cafe', 'post_site')
  and not exists (
    select 1 from pnl_expense_categories p
    where p.expense_category_id = e.id
      and p.department = s.department
      and (
        (p.logistics_stage is null and s.logistics_stage is null)
        or p.logistics_stage = s.logistics_stage
      )
  );
