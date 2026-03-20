-- ШК короба (единый на номер короба), подставляется текстовым списком короб:ШК

alter table wb_inbound_items add column if not exists box_shk text;

comment on column wb_inbound_items.box_shk is 'ШК короба; сопоставление с номером короба (box_number) по загруженному списку';
