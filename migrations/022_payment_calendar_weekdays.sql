-- Платёжный календарь: платежные дни недели (например вторник и четверг).
-- payment_weekdays — массив номеров дней недели (0=вс, 1=пн, ..., 6=сб). Пустой = не задано, оплата по первому рабочему дню.
alter table payment_calendar
  add column if not exists payment_weekdays integer[] not null default '{}';

comment on column payment_calendar.payment_weekdays is 'Платежные дни недели (0=вс, 1=пн, ..., 6=сб). При наступлении срока оплата в первый из этих дней. Пустой = первый рабочий день.';
