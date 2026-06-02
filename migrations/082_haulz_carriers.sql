-- ========== 082_haulz_carriers.sql ==========
-- Справочник перевозчиков для упаковочных листов и других документов HAULZ.

create table if not exists haulz_carriers (
  id bigserial primary key,
  name text not null,
  legal_address text not null default '',
  inn text not null default '',
  kpp text not null default '',
  loading_address text not null default '',
  unloading_address text not null default '',
  created_by_login text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists haulz_carriers_name_idx on haulz_carriers (lower(name));

comment on table haulz_carriers is 'Перевозчики: реквизиты и адреса загрузки/выгрузки';

insert into haulz_carriers (name, legal_address, inn, kpp, loading_address, unloading_address, created_by_login)
select
  'ООО «ХОЛЗ»',
  '119049, Город Москва, вн.тер. г. Муниципальный Округ Якиманка, ул Мытная, дом 28, строение 3, помещение 1/1',
  '9706037094',
  '770601001',
  'Россия, г. Калининград, ул. Железнодорожная 12 склад 23',
  'Россия, г. Москва, ул. Вавилова, д. 19',
  'system'
where not exists (select 1 from haulz_carriers where inn = '9706037094' and kpp = '770601001');
