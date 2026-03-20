-- Логистика по посылке (WB): импорт из возвратной описи / отчётов, связь с сводной по ключу «Посылка» ≈ box_shk

create table if not exists wb_logistics_parcel (
  id bigserial primary key,
  parcel_key text not null,
  perevozka_nasha text,
  otchet_dostavki text,
  otpavka_ap text,
  stoimost text,
  logistics_status text,
  data_doc text,
  data_info_received text,
  data_packed text,
  data_consolidated text,
  data_sent_airport text,
  data_departed text,
  data_to_hand text,
  data_delivered text,
  source_filename text,
  updated_at timestamptz not null default now()
);

create unique index if not exists wb_logistics_parcel_parcel_key_norm_uq
  on wb_logistics_parcel ((lower(trim(parcel_key))));

create index if not exists wb_logistics_parcel_updated_at_idx
  on wb_logistics_parcel (updated_at desc);
