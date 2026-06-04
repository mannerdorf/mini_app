-- Черновики и сохранённые расчёты калькулятора HAULZ (временное хранение до оформления в 1С).

create table if not exists haulz_calc_drafts (
  id bigserial primary key,
  login_key text not null,
  title text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  nomer_zayavki text,
  form_state jsonb not null,
  quote_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists haulz_calc_drafts_login_updated_idx
  on haulz_calc_drafts(login_key, updated_at desc);

comment on table haulz_calc_drafts is 'Черновики калькулятора доставки HAULZ для продолжения расчёта';
