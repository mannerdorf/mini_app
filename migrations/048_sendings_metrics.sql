-- Агрегированные метрики по отправкам для стабильного расчёта времени в пути.
create table if not exists sendings_metrics (
  customer_inn text not null,
  sending_number text not null,
  cargo_numbers jsonb not null default '[]'::jsonb,
  send_start_at timestamptz,
  first_ready_at timestamptz,
  in_transit_hours numeric(12, 2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_inn, sending_number)
);

create index if not exists sendings_metrics_customer_inn_idx
  on sendings_metrics(customer_inn);

create index if not exists sendings_metrics_first_ready_at_idx
  on sendings_metrics(first_ready_at desc);

create index if not exists sendings_metrics_last_seen_at_idx
  on sendings_metrics(last_seen_at desc);
