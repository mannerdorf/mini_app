-- Статус ЭДО для договоров и актов сверки (из RecipientResponseStatus при синке из 1С).
alter table cache_dogovors
  add column if not exists edo_status text not null default '';

alter table cache_sverki
  add column if not exists edo_status text not null default '';

create index if not exists cache_dogovors_edo_status_idx
  on cache_dogovors (edo_status)
  where edo_status <> '';

create index if not exists cache_sverki_edo_status_idx
  on cache_sverki (edo_status)
  where edo_status <> '';

update cache_dogovors
set edo_status = coalesce(
  nullif(trim(data->>'RecipientResponseStatus'), ''),
  nullif(trim(data->>'recipientResponseStatus'), ''),
  nullif(trim(data->>'DDRecipientResponseStatus'), ''),
  ''
)
where edo_status = '' and data is not null;

update cache_sverki
set edo_status = coalesce(
  nullif(trim(data->>'RecipientResponseStatus'), ''),
  nullif(trim(data->>'recipientResponseStatus'), ''),
  nullif(trim(data->>'DDRecipientResponseStatus'), ''),
  ''
)
where edo_status = '' and data is not null;
