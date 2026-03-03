-- Раздел "Претензии": заявки, статусы, комментарии, вложения (фото/PDF в БД), ссылки на видео, очередь push.

-- 1) Счетчик номеров претензий по годам (для формата CLM-2026-000123)
create table if not exists claims_counters (
  year int primary key,
  last_number int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function next_claim_number(p_created_at timestamptz default now())
returns text
language plpgsql
as $$
declare
  y int;
  n int;
begin
  y := extract(year from p_created_at)::int;

  insert into claims_counters(year, last_number, updated_at)
  values (y, 1, now())
  on conflict (year) do update
    set last_number = claims_counters.last_number + 1,
        updated_at = now()
  returning last_number into n;

  return format('CLM-%s-%s', y, lpad(n::text, 6, '0'));
end;
$$;

-- 2) Основная таблица претензий
create table if not exists claims (
  id bigserial primary key,
  claim_number text not null unique,              -- CLM-YYYY-000001
  customer_login text not null default '',
  customer_company_name text not null default '',
  customer_inn text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',

  cargo_number text not null default '',          -- номер перевозки (по ТЗ)
  claim_type text not null default 'other' check (claim_type in (
    'cargo_damage',           -- Порча груза
    'quantity_mismatch',      -- Несоответствие по количеству
    'cargo_loss',             -- Утрата
    'other'                   -- Другое
  )),

  description text not null default '',
  requested_amount numeric(14,2),                 -- сумма требований клиента
  approved_amount numeric(14,2),                  -- сумма, признанная к компенсации

  status text not null default 'new' check (status in (
    'draft',
    'new',
    'under_review',
    'waiting_docs',
    'in_progress',
    'awaiting_leader',
    'sent_to_accounting',
    'approved',
    'rejected',
    'paid',
    'offset',
    'closed'
  )),
  status_changed_at timestamptz not null default now(),
  sla_due_at timestamptz not null default (now() + interval '10 days'), -- календарные 10 дней

  manager_login text not null default '',
  expert_login text not null default '',
  leader_login text not null default '',
  accountant_login text not null default '',

  manager_note text not null default '',
  leader_comment text not null default '',
  accounting_note text not null default '',
  customer_resolution text not null default 'pending' check (customer_resolution in ('pending', 'agree', 'disagree')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists claims_customer_login_idx on claims(customer_login);
create index if not exists claims_customer_inn_idx on claims(customer_inn);
create index if not exists claims_cargo_number_idx on claims(cargo_number);
create index if not exists claims_status_idx on claims(status);
create index if not exists claims_sla_due_at_idx on claims(sla_due_at);
create index if not exists claims_created_at_idx on claims(created_at desc);

-- Автогенерация claim_number
create or replace function claims_set_number_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.claim_number is null or btrim(new.claim_number) = '' then
    new.claim_number := next_claim_number(coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_claims_set_number_before_insert on claims;
create trigger trg_claims_set_number_before_insert
before insert on claims
for each row
execute function claims_set_number_before_insert();

-- Обновление updated_at
create or replace function claims_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_claims_set_updated_at on claims;
create trigger trg_claims_set_updated_at
before update on claims
for each row
execute function claims_set_updated_at();

-- 3) Фото (храним байты в БД), до 10 на претензию, до 5MB каждое
create table if not exists claim_photos (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  file_name text not null default '',
  mime_type text not null default '',
  caption text not null default '',
  file_bytes bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(file_bytes) <= 5242880)
);

create index if not exists claim_photos_claim_id_idx on claim_photos(claim_id);

-- 4) PDF-документы (ТТН, акт и т.д.), до 5MB
create table if not exists claim_documents (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  file_name text not null default '',
  mime_type text not null default 'application/pdf',
  doc_type text not null default 'other' check (doc_type in ('ttn', 'act', 'other')),
  file_bytes bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(file_bytes) <= 5242880)
);

create index if not exists claim_documents_claim_id_idx on claim_documents(claim_id);

-- 5) Видео (только ссылки)
create table if not exists claim_video_links (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  url text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  check (url ~* '^https?://')
);

create index if not exists claim_video_links_claim_id_idx on claim_video_links(claim_id);

-- 6) Комментарии внутри претензии
create table if not exists claim_comments (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  author_login text not null default '',
  author_role text not null default 'client' check (author_role in ('client', 'manager', 'leader', 'accountant', 'system')),
  comment_text text not null default '',
  is_internal boolean not null default false, -- служебный комментарий (скрыт от клиента)
  created_at timestamptz not null default now()
);

create index if not exists claim_comments_claim_id_idx on claim_comments(claim_id);
create index if not exists claim_comments_created_at_idx on claim_comments(created_at);

-- 7) История изменений (activity feed)
create table if not exists claim_events (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  actor_login text not null default '',
  actor_role text not null default 'system',
  event_type text not null default '',         -- e.g. status_changed, comment_added, files_uploaded
  from_status text,
  to_status text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists claim_events_claim_id_idx on claim_events(claim_id);
create index if not exists claim_events_created_at_idx on claim_events(created_at);

-- 8) Очередь push-уведомлений
create table if not exists claim_push_queue (
  id bigserial primary key,
  claim_id bigint references claims(id) on delete cascade,
  recipient_login text not null default '',
  title text not null default '',
  body text not null default '',
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists claim_push_queue_status_idx on claim_push_queue(status, scheduled_at);
create index if not exists claim_push_queue_recipient_idx on claim_push_queue(recipient_login);
