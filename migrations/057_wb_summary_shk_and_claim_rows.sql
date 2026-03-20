-- WB: ШК в претензиях и сводной; сводная — по строкам претензии, сопоставление с описью по ШК

alter table wb_claims_items add column if not exists shk text;

alter table wb_summary add column if not exists id bigserial;

alter table wb_summary drop constraint if exists wb_summary_pkey;
alter table wb_summary add primary key (id);

alter table wb_summary alter column box_id drop not null;

alter table wb_summary add column if not exists shk text;
alter table wb_summary add column if not exists is_returned boolean not null default false;

create index if not exists wb_summary_claim_item_id_idx on wb_summary(claim_item_id);
create index if not exists wb_summary_shk_idx on wb_summary(shk);
create index if not exists wb_summary_box_id_idx on wb_summary(box_id);

comment on column wb_claims_items.shk is 'ШК из файла претензий; сопоставление с wb_inbound_items.shk';
comment on column wb_summary.shk is 'ШК (претензия/опись); ключ поиска в описи';
comment on column wb_summary.is_returned is 'Возврат по ШК/коробу (wb_returned_items)';
