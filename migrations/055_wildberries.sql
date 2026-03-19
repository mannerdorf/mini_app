-- WB module: inbound/returned/claims imports + summary

create table if not exists wb_inbound_import_batches (
  id bigserial primary key,
  block_type text not null check (block_type in ('inbound', 'returned', 'claims')),
  mode text not null check (mode in ('append', 'upsert')),
  source_filename text,
  uploaded_by_login text,
  uploaded_at timestamptz not null default now(),
  total_rows int not null default 0,
  inserted_rows int not null default 0,
  updated_rows int not null default 0,
  skipped_rows int not null default 0,
  error_rows int not null default 0,
  status text not null default 'completed' check (status in ('completed', 'failed', 'partial')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists wb_inbound_import_batches_block_type_idx
  on wb_inbound_import_batches(block_type, uploaded_at desc);

create table if not exists wb_import_row_errors (
  id bigserial primary key,
  batch_id bigint not null references wb_inbound_import_batches(id) on delete cascade,
  row_number int,
  error_message text not null,
  row_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wb_import_row_errors_batch_id_idx
  on wb_import_row_errors(batch_id);

create table if not exists wb_inbound_items (
  id bigserial primary key,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  inventory_number text not null,
  inventory_created_at date,
  row_number int,
  box_number text not null,
  shk text not null,
  sticker text,
  barcode text,
  phone text,
  receiver_full_name text,
  article text,
  brand text,
  nomenclature text,
  size text,
  description text,
  kit text,
  price_rub numeric(14,2),
  tnv_ed text,
  mass_kg numeric(14,3),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_number, box_number, shk)
);

create index if not exists wb_inbound_items_inventory_idx
  on wb_inbound_items(inventory_number, inventory_created_at);
create index if not exists wb_inbound_items_box_idx
  on wb_inbound_items(box_number);
create index if not exists wb_inbound_items_article_idx
  on wb_inbound_items(article);
create index if not exists wb_inbound_items_brand_idx
  on wb_inbound_items(brand);
create index if not exists wb_inbound_items_created_at_idx
  on wb_inbound_items(created_at desc);

create table if not exists wb_returned_items (
  id bigserial primary key,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  source text not null default 'import' check (source in ('import', 'manual')),
  box_id text not null,
  cargo_number text,
  description text,
  has_shk boolean not null default true,
  document_number text,
  document_date date,
  amount_rub numeric(14,2),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wb_returned_items_box_idx
  on wb_returned_items(box_id);
create index if not exists wb_returned_items_document_idx
  on wb_returned_items(document_number, document_date);
create index if not exists wb_returned_items_created_at_idx
  on wb_returned_items(created_at desc);

create table if not exists wb_claims_revisions (
  id bigserial primary key,
  revision_number int not null,
  source_filename text,
  uploaded_by_login text,
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default false,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  notes text
);

create unique index if not exists wb_claims_revisions_revision_number_uidx
  on wb_claims_revisions(revision_number);
create unique index if not exists wb_claims_revisions_active_uidx
  on wb_claims_revisions(is_active) where is_active = true;

create table if not exists wb_claims_items (
  id bigserial primary key,
  revision_id bigint not null references wb_claims_revisions(id) on delete cascade,
  row_number int,
  claim_number text,
  box_id text,
  doc_number text,
  doc_date date,
  description text,
  amount_rub numeric(14,2),
  all_columns jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wb_claims_items_revision_idx
  on wb_claims_items(revision_id);
create index if not exists wb_claims_items_box_idx
  on wb_claims_items(box_id);
create index if not exists wb_claims_items_claim_number_idx
  on wb_claims_items(claim_number);
create index if not exists wb_claims_items_doc_date_idx
  on wb_claims_items(doc_date);

create table if not exists wb_summary (
  box_id text primary key,
  claim_number text,
  declared boolean not null default false,
  source_document_number text,
  source_document_date date,
  source_row_number int,
  description text,
  cost_rub numeric(14,2),
  inbound_item_id bigint references wb_inbound_items(id) on delete set null,
  returned_item_id bigint references wb_returned_items(id) on delete set null,
  claim_item_id bigint references wb_claims_items(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists wb_summary_declared_idx
  on wb_summary(declared, updated_at desc);
create index if not exists wb_summary_doc_idx
  on wb_summary(source_document_number, source_document_date);

