-- Импорт отгрузок 5 POST (OMNI) из Excel.

create table if not exists fivepost_import_batches (
  id serial primary key,
  login text not null default '',
  filename text not null default '',
  route text not null default 'kgd_mow',
  status text not null default 'completed',
  row_count int not null default 0,
  translated_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists fivepost_import_batches_created_at_idx
  on fivepost_import_batches (created_at desc);

create table if not exists fivepost_shipment_rows (
  id bigserial primary key,
  batch_id int not null references fivepost_import_batches (id) on delete cascade,
  line_no int not null,
  client_order_no text not null default '',
  partner_order_no text not null default '',
  te_barcode text not null default '',
  places_count int not null default 1,
  omni_barcode text not null default '',
  item_name text not null default '',
  item_name_ru text not null default '',
  unit_cost numeric(14, 2),
  total_cost numeric(14, 2),
  weight_g numeric(14, 2),
  length_mm numeric(14, 2),
  width_mm numeric(14, 2),
  height_mm numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists fivepost_shipment_rows_batch_id_idx on fivepost_shipment_rows (batch_id);
create index if not exists fivepost_shipment_rows_client_order_idx on fivepost_shipment_rows (client_order_no);
create index if not exists fivepost_shipment_rows_partner_order_idx on fivepost_shipment_rows (partner_order_no);
create index if not exists fivepost_shipment_rows_omni_barcode_idx on fivepost_shipment_rows (omni_barcode);
