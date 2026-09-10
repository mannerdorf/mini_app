-- Перезаписать тарифы жёсткой упаковки (если seed вставился с ошибкой).
insert into haulz_calc_tariff_versions (tariff_set_id, effective_from, payload, created_by, comment)
select
  s.id,
  current_date,
  '{
    "max_height_m": 1.8,
    "pallet_types": [
      {"code":"1200x1000","label":"1200×1000","length_mm":1200,"width_mm":1000,"price_per_meter_rub":2000,"pallet_price_rub":350},
      {"code":"1200x800","label":"1200×800","length_mm":1200,"width_mm":800,"price_per_meter_rub":1700,"pallet_price_rub":250},
      {"code":"800x600","label":"800×600","length_mm":800,"width_mm":600,"price_per_meter_rub":1000,"pallet_price_rub":200},
      {"code":"600x400","label":"600×400","length_mm":600,"width_mm":400,"price_per_meter_rub":900,"pallet_price_rub":200}
    ]
  }'::jsonb,
  'fix_script',
  'fix rigid packaging pallet types'
from haulz_calc_tariff_sets s
where s.code = 'calc_rigid_packaging'
on conflict (tariff_set_id, effective_from) do update
  set payload = excluded.payload,
      comment = excluded.comment,
      created_by = excluded.created_by;
