-- Справочник санкционных ограничений для транзита РФ -> Калининград через Литву.
-- Сценарий: только направление Москва -> Калининград, проверка по ТН ВЭД и ключевым словам.
-- Источники храним отдельно, чтобы правила можно было обновлять импортом без изменения UI.

create table if not exists sanction_sources (
  id bigserial primary key,
  source_key text not null unique,
  title text not null,
  url text not null,
  publisher text,
  source_type text not null default 'open_source',
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sanction_rule_sets (
  id bigserial primary key,
  rule_set_key text not null unique,
  title text not null,
  direction text not null default 'RU_MOW_TO_RU_KGD_VIA_LT',
  jurisdiction text not null default 'EU_LT',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sanction_rules (
  id bigserial primary key,
  rule_set_id bigint not null references sanction_rule_sets(id) on delete cascade,
  source_id bigint references sanction_sources(id) on delete set null,
  match_type text not null check (match_type in ('tnved_prefix', 'tnved_exact', 'keyword')),
  match_value text not null,
  verdict text not null check (verdict in ('sanctioned', 'review')),
  title text not null,
  description text,
  legal_basis text,
  priority int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_set_id, match_type, match_value)
);

create index if not exists sanction_rules_rule_set_idx on sanction_rules(rule_set_id);
create index if not exists sanction_rules_match_idx on sanction_rules(match_type, match_value);
create index if not exists sanction_rules_active_idx on sanction_rules(active) where active = true;

create table if not exists nomenclature_tnved_map (
  id bigserial primary key,
  pattern text not null unique,
  tnved_code text not null,
  confidence numeric(5, 2) not null default 0.70,
  source text not null default 'manual',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nomenclature_tnved_map_active_idx on nomenclature_tnved_map(active) where active = true;
create index if not exists nomenclature_tnved_map_tnved_idx on nomenclature_tnved_map(tnved_code);

create table if not exists sending_sanction_checks (
  id bigserial primary key,
  sending_number text,
  sending_date date,
  route text not null default 'MSK-KGD',
  cargo_number text,
  parcel_number text,
  nomenclature text,
  tnved_code text,
  check_method text not null default 'tnved_and_keyword',
  verdict text not null check (verdict in ('sanctioned', 'clear', 'review')),
  matched_rule_ids bigint[] not null default '{}',
  matched_keywords text[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  checked_by text,
  checked_at timestamptz not null default now()
);

create index if not exists sending_sanction_checks_sending_idx
  on sending_sanction_checks(sending_number, checked_at desc);

create index if not exists sending_sanction_checks_verdict_idx
  on sending_sanction_checks(verdict, checked_at desc);

insert into sanction_sources (source_key, title, url, publisher, source_type)
values
  ('alta_833_2014_consolidated', 'Council Regulation (EU) No 833/2014, consolidated text on Alta', 'https://www.alta.ru/tnved/docs/CELEX_02014R0833-20260116_EN_TXT.pdf', 'Alta-Soft / EUR-Lex', 'legal_text'),
  ('alta_kaliningrad_restricted_goods_2022', 'Опубликованы перечни запрещенных для перевозки в Калининград товаров', 'https://www.alta.ru/external_news/91025/', 'Alta-Soft', 'news'),
  ('ec_customs_faq_russia_sanctions', 'EU customs FAQ on Russia sanctions and Kaliningrad transit', 'https://finance.ec.europa.eu/system/files/2023-07/faqs-sanctions-russia-customs_en.pdf', 'European Commission', 'guidance'),
  ('ec_transit_listed_goods_faq', 'EU FAQ on transit of listed goods under Russia sanctions', 'https://finance.ec.europa.eu/system/files/2023-07/faqs-sanctions-russia-transit-listed-goods_en.pdf', 'European Commission', 'guidance'),
  ('lt_customs_manufacturer_declaration_2023', 'Lithuanian customs controls for transit/export via Russia or Belarus', 'https://nav.gov.hu/pfile/file?path=%2Fvam%2Fkivitel%2Fa-litvan-kiviteli-szabalyok-ujabb-szigoritasa-pdf', 'Lithuanian Customs / NAV mirror', 'guidance'),
  ('lrt_kaliningrad_transit_resumed_2022', 'Kaliningrad sanctioned goods transit under EC guidance', 'https://www.lrt.lt/en/news-in-english/19/1746506/first-russian-train-with-sanctioned-goods-reaches-lithuanian-border-as-kaliningrad-transit-resumes', 'LRT', 'news')
on conflict (source_key) do update set
  title = excluded.title,
  url = excluded.url,
  publisher = excluded.publisher,
  source_type = excluded.source_type,
  updated_at = now();

insert into sanction_rule_sets (rule_set_key, title, notes)
values (
  'ru_mow_to_ru_kgd_via_lt_v1',
  'Москва -> Калининград через Литву: стартовый справочник санкционных рисков',
  'Стартовый набор для первичной маркировки. Требует юридической/таможенной валидации и регулярного обновления из источников.'
)
on conflict (rule_set_key) do update set
  title = excluded.title,
  notes = excluded.notes,
  updated_at = now();

with rs as (
  select id from sanction_rule_sets where rule_set_key = 'ru_mow_to_ru_kgd_via_lt_v1'
),
src as (
  select source_key, id from sanction_sources
),
rules(match_type, match_value, verdict, title, description, source_key, priority) as (
  values
    ('tnved_prefix', '72', 'sanctioned', 'Черные металлы', 'Steel and ferrous metals: санкционный риск для транзита через Литву.', 'ec_customs_faq_russia_sanctions', 10),
    ('tnved_prefix', '73', 'sanctioned', 'Изделия из черных металлов', 'Iron/steel articles, включая крепеж 7318: требуется проверка санкционного режима.', 'ec_customs_faq_russia_sanctions', 10),
    ('tnved_prefix', '2523', 'sanctioned', 'Цемент', 'Cement mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '44', 'sanctioned', 'Древесина и изделия из древесины', 'Wood products mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '70', 'sanctioned', 'Стекло и изделия из стекла', 'Glass products mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '76', 'sanctioned', 'Алюминий и изделия из алюминия', 'Aluminium products mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '48', 'sanctioned', 'Бумага и картон', 'Paper products mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '2520', 'sanctioned', 'Гипс', 'Gypsum products mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '2701', 'sanctioned', 'Уголь', 'Coal and solid fossil fuels phased into restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '2710', 'sanctioned', 'Нефтепродукты', 'Oil and petroleum products require sanctions review.', 'lrt_kaliningrad_transit_resumed_2022', 20),
    ('tnved_prefix', '31', 'sanctioned', 'Удобрения', 'Fertilisers reported under quota/sanction controls.', 'lrt_kaliningrad_transit_resumed_2022', 30),
    ('tnved_prefix', '2203', 'sanctioned', 'Алкогольная продукция', 'Alcohol mentioned in Kaliningrad transit restrictions.', 'lrt_kaliningrad_transit_resumed_2022', 30),
    ('tnved_prefix', '8482', 'review', 'Подшипники', 'Lithuanian customs manufacturer declaration list includes 8482.', 'lt_customs_manufacturer_declaration_2023', 40),
    ('tnved_prefix', '8481', 'review', 'Клапаны и арматура', 'Lithuanian customs manufacturer declaration list includes 8481 groups.', 'lt_customs_manufacturer_declaration_2023', 40),
    ('tnved_prefix', '8501', 'review', 'Электродвигатели', 'Lithuanian customs manufacturer declaration list includes 8501.', 'lt_customs_manufacturer_declaration_2023', 40),
    ('tnved_prefix', '8542', 'review', 'Микросхемы', 'Lithuanian customs manufacturer declaration list includes 8542.', 'lt_customs_manufacturer_declaration_2023', 40),
    ('keyword', 'болт', 'sanctioned', 'Крепеж из черных металлов', 'По умолчанию сопоставляется с 7318 и требует санкционной проверки.', 'ec_customs_faq_russia_sanctions', 50),
    ('keyword', 'подшипник', 'review', 'Подшипники', 'Ключевое слово для 8482.', 'lt_customs_manufacturer_declaration_2023', 50),
    ('keyword', 'клапан', 'review', 'Клапаны', 'Ключевое слово для 8481.', 'lt_customs_manufacturer_declaration_2023', 50)
)
insert into sanction_rules (
  rule_set_id,
  source_id,
  match_type,
  match_value,
  verdict,
  title,
  description,
  priority
)
select
  rs.id,
  src.id,
  rules.match_type,
  rules.match_value,
  rules.verdict,
  rules.title,
  rules.description,
  rules.priority
from rules
cross join rs
left join src on src.source_key = rules.source_key
on conflict (rule_set_id, match_type, match_value) do update set
  source_id = excluded.source_id,
  verdict = excluded.verdict,
  title = excluded.title,
  description = excluded.description,
  priority = excluded.priority,
  active = true,
  updated_at = now();

insert into nomenclature_tnved_map (pattern, tnved_code, confidence, source, notes)
values
  ('болт', '731815', 0.78, 'starter_dictionary', 'Болты и винты из черных металлов; уточнять материал и назначение.'),
  ('винт', '731815', 0.72, 'starter_dictionary', 'Винты/болты из черных металлов; требуется уточнение.'),
  ('гайк', '731816', 0.72, 'starter_dictionary', 'Гайки из черных металлов; требуется уточнение.'),
  ('шайб', '731822', 0.72, 'starter_dictionary', 'Шайбы из черных металлов; требуется уточнение.'),
  ('подшипник', '8482', 0.80, 'starter_dictionary', 'Подшипники.'),
  ('клапан', '8481', 0.72, 'starter_dictionary', 'Клапаны/арматура.'),
  ('насос', '8413', 0.70, 'starter_dictionary', 'Насосы; уточнять тип.'),
  ('двигател', '8501', 0.68, 'starter_dictionary', 'Электродвигатели; для ДВС уточнять 8407/8408.'),
  ('микросхем', '8542', 0.85, 'starter_dictionary', 'Интегральные схемы.'),
  ('цемент', '2523', 0.90, 'starter_dictionary', 'Цемент.'),
  ('древес', '44', 0.65, 'starter_dictionary', 'Древесина/изделия из древесины.'),
  ('стекл', '70', 0.65, 'starter_dictionary', 'Стекло/изделия из стекла.'),
  ('алюмин', '76', 0.65, 'starter_dictionary', 'Алюминий/изделия из алюминия.'),
  ('бумаг', '48', 0.65, 'starter_dictionary', 'Бумага/картон.'),
  ('гипс', '2520', 0.80, 'starter_dictionary', 'Гипс.')
on conflict (pattern) do update set
  tnved_code = excluded.tnved_code,
  confidence = excluded.confidence,
  source = excluded.source,
  notes = excluded.notes,
  active = true,
  updated_at = now();
