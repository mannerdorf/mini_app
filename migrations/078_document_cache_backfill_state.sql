  -- Состояние пошагового backfill cache_perevozki / cache_invoices / … из 1С
  create table if not exists document_cache_backfill_state (
    id int primary key default 1 check (id = 1),
    range_start date not null,
    range_end date not null,
    next_from date not null,
    step_days int not null default 30,
    done boolean not null default false,
    last_step jsonb,
    updated_at timestamptz not null default now()
  );
