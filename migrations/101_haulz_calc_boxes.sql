-- ========== 101_haulz_calc_boxes.sql ==========
-- Коробки по размерам XS–XL для калькулятора.

alter table haulz_calc_tariff_sets drop constraint if exists haulz_calc_tariff_sets_block_check;

alter table haulz_calc_tariff_sets add constraint haulz_calc_tariff_sets_block_check
  check (block in ('pickup', 'mainline', 'last_mile', 'extra', 'settings', 'rigid_packaging', 'boxes'));
