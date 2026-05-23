-- Привязка перевозки к конкретной отправке (рейсу) и ТС.
-- Уникальность: одна перевозка на одну отправку; фильтр по ТС + дате рейса без смешения соседних рейсов.
create table if not exists cargo_sending_assignments (
  customer_inn text not null,
  sending_number text not null,
  cargo_number text not null,
  sending_date date,
  vehicle_normalized text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (customer_inn, sending_number, cargo_number)
);

create index if not exists cargo_sending_assignments_vehicle_date_idx
  on cargo_sending_assignments (vehicle_normalized, sending_date);

create index if not exists cargo_sending_assignments_cargo_idx
  on cargo_sending_assignments (cargo_number);

create index if not exists cargo_sending_assignments_last_seen_idx
  on cargo_sending_assignments (last_seen_at desc);
