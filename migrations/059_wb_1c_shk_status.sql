-- Справочник ШК короба → статус 1С и номер перевозки для скачивания АПП (вкладка WB «Описи»).
-- Заполняется вручную (INSERT/импорт) или отдельным процессом.

create table if not exists wb_1c_shk_status (
  id bigserial primary key,
  shk text not null,
  status_1c text not null default '',
  cargo_number text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists wb_1c_shk_status_shk_lower_trim_uq
  on wb_1c_shk_status (lower(trim(shk)));

comment on table wb_1c_shk_status is 'WB: соответствие ШК короба данным 1С (статус, номер перевозки для GetFile АПП)';
