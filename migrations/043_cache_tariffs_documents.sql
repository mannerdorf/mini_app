-- Расширение кэша тарифов под структуру документов GETTarifs.
alter table cache_tariffs add column if not exists doc_date timestamptz;
alter table cache_tariffs add column if not exists doc_number text not null default '';
alter table cache_tariffs add column if not exists customer_name text not null default '';
alter table cache_tariffs add column if not exists customer_inn text not null default '';
alter table cache_tariffs add column if not exists city_from text not null default '';
alter table cache_tariffs add column if not exists city_to text not null default '';
alter table cache_tariffs add column if not exists transport_type text not null default '';
alter table cache_tariffs add column if not exists is_dangerous boolean not null default false;
alter table cache_tariffs add column if not exists is_vet boolean not null default false;
alter table cache_tariffs add column if not exists tariff numeric(18, 4);

create index if not exists cache_tariffs_customer_inn_idx on cache_tariffs(customer_inn);
create index if not exists cache_tariffs_doc_date_idx on cache_tariffs(doc_date desc);
create index if not exists cache_tariffs_doc_number_idx on cache_tariffs(doc_number);
