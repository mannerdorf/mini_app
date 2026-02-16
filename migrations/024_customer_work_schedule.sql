-- Рабочий график заказчика: дни недели и часы работы.
-- days_of_week: массив 1=пн, 2=вт, ..., 7=вс (ISO 8601).
-- work_start, work_end: время начала и окончания рабочего дня.
create table if not exists customer_work_schedule (
  inn text not null primary key,
  days_of_week smallint[] not null default '{1,2,3,4,5}',
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table customer_work_schedule is 'Рабочий график заказчика: дни недели (1=пн..7=вс) и часы работы';
comment on column customer_work_schedule.days_of_week is 'Дни недели: 1=понедельник, 2=вторник, ..., 7=воскресенье';
comment on column customer_work_schedule.work_start is 'Время начала рабочего дня';
comment on column customer_work_schedule.work_end is 'Время окончания рабочего дня';

create index if not exists customer_work_schedule_inn_idx on customer_work_schedule(inn);
