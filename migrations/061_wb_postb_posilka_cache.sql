-- Кэш ответа GetPosilka по коду посылки (ШК короба): статус, перевозка, шаги — без повторных запросов к PostB

create table if not exists wb_postb_posilka_cache (
  id bigserial primary key,
  posilka_code text not null,
  posilka_code_norm text not null,
  last_status text not null default '',
  perevozka text not null default '',
  posilka_steps jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists wb_postb_posilka_cache_norm_uq
  on wb_postb_posilka_cache (posilka_code_norm);

create index if not exists wb_postb_posilka_cache_updated_at_idx
  on wb_postb_posilka_cache (updated_at desc);
