-- Справочник паромов. Наименование, MMSI, доп. данные из Marinesia (IMO, тип судна, вместимость, оператор).

create table if not exists ferries (
  id bigserial primary key,
  name text not null,
  mmsi text not null,
  imo text,
  vessel_type text,
  teu_capacity int,
  trailer_capacity int,
  operator text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mmsi)
);

create index if not exists ferries_name_idx on ferries(name);
create index if not exists ferries_mmsi_idx on ferries(mmsi);

-- Начальное наполнение
insert into ferries (name, mmsi) values
  ('Marshal Rokossovsky', '273214860'),
  ('General Chernyakhovsky', '273298390'),
  ('Baltiysk', '273317640'),
  ('Ambal', '273355410'),
  ('Novik Maria', '273257140'),
  ('Sparta II', '273394890'),
  ('Ursa Major', '273396130'),
  ('Sparta IV', '273413440'),
  ('Antey', '273549720'),
  ('Sparta', '273351920'),
  ('Maria', '273359830'),
  ('Pizhma', '273453210'),
  ('Lady D', '305973000'),
  ('Baltic Leader', '273549530'),
  ('Yaz', '273418650'),
  ('Kapitan Mironov', '273427610'),
  ('Kapitan Shevchenko', '273438720')
on conflict (mmsi) do update set
  name = excluded.name,
  updated_at = now();
