-- ========== 054_expense_requests_transport_type.sql ==========
alter table expense_requests
  add column if not exists transport_type text not null default 'auto';

update expense_requests
set transport_type = case
  when lower(trim(category_id)) = 'ferry' then 'ferry'
  else 'auto'
end
where transport_type is null
   or lower(trim(transport_type)) not in ('auto', 'ferry');

