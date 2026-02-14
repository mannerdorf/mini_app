-- Платёжный календарь: условия оплаты по заказчикам (ИНН).
-- days_to_pay — срок оплаты счёта в днях с момента выставления (0 = не задано).
create table if not exists payment_calendar (
  inn text not null primary key,
  days_to_pay int not null default 0,
  updated_at timestamptz not null default now()
);

comment on table payment_calendar is 'Условия оплаты по заказчикам: срок в днях с момента выставления счёта';
comment on column payment_calendar.days_to_pay is 'Количество дней на оплату с момента выставления счёта';
