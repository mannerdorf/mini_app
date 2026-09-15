export type VehiclePresetOption = { value: string; label: string };

export const VEHICLE_MODEL_PRESETS: VehiclePresetOption[] = [
  { value: "ГАЗель Next", label: "ГАЗель Next" },
  { value: "ГАЗель Бизнес", label: "ГАЗель Бизнес" },
  { value: "ГАЗель NN", label: "ГАЗель NN" },
  { value: "Mercedes Sprinter", label: "Mercedes Sprinter" },
  { value: "Ford Transit", label: "Ford Transit" },
  { value: "Volkswagen Crafter", label: "Volkswagen Crafter" },
  { value: "Peugeot Boxer", label: "Peugeot Boxer" },
  { value: "Citroën Jumper", label: "Citroën Jumper" },
  { value: "MAN TGE", label: "MAN TGE" },
  { value: "Iveco Daily", label: "Iveco Daily" },
];

export const VEHICLE_BODY_TYPE_PRESETS: VehiclePresetOption[] = [
  { value: "Фургон", label: "Фургон" },
  { value: "Тент", label: "Тент" },
  { value: "Борт", label: "Борт" },
  { value: "Рефрижератор", label: "Рефрижератор" },
  { value: "Изотерм", label: "Изотерм" },
  { value: "Контейнер", label: "Контейнер" },
  { value: "Цельномет", label: "Цельномет" },
];

export const VEHICLE_LOADING_PRESETS: VehiclePresetOption[] = [
  { value: "Задняя", label: "Задняя" },
  { value: "Боковая", label: "Боковая" },
  { value: "Верхняя", label: "Верхняя" },
  { value: "Задняя и боковая", label: "Задняя и боковая" },
  { value: "С бортов", label: "С бортов (кран / ручная)" },
];

export const VEHICLE_PERMITS_PRESETS: VehiclePresetOption[] = [
  { value: "Без ограничений", label: "Без ограничений" },
  { value: "МКАД", label: "Пропуск МКАД" },
  { value: "ТТК", label: "Пропуск ТТК" },
  { value: "СК", label: "Пропуск СК" },
  { value: "Центр (Москва)", label: "Центр (Москва)" },
  { value: "Ночной центр", label: "Ночной центр" },
];

/** Длина × ширина × высота, см (типовые фургоны). */
export const VEHICLE_DIMENSIONS_PRESETS: VehiclePresetOption[] = [
  { value: "290×190×190", label: "290×190×190 — компактный фургон" },
  { value: "330×200×200", label: "330×200×200 — ГАЗель классика" },
  { value: "420×210×210", label: "420×210×210 — удлинённый фургон" },
  { value: "430×220×230", label: "430×220×230 — Sprinter L2H2" },
  { value: "600×245×245", label: "600×245×245 — 5–7 т" },
];

export const VEHICLE_CAPACITY_KG_PRESETS: VehiclePresetOption[] = [
  { value: "750", label: "750 кг" },
  { value: "1500", label: "1 500 кг" },
  { value: "2000", label: "2 000 кг" },
  { value: "3500", label: "3 500 кг" },
  { value: "5000", label: "5 000 кг" },
  { value: "10000", label: "10 000 кг" },
];

export const VEHICLE_CAPACITY_M3_PRESETS: VehiclePresetOption[] = [
  { value: "6", label: "6 м³" },
  { value: "9", label: "9 м³" },
  { value: "12", label: "12 м³" },
  { value: "16", label: "16 м³" },
  { value: "20", label: "20 м³" },
  { value: "30", label: "30 м³" },
];

export const VEHICLE_PALLETS_PRESETS: VehiclePresetOption[] = [
  { value: "2", label: "2 палета" },
  { value: "4", label: "4 палета" },
  { value: "6", label: "6 палет" },
  { value: "8", label: "8 палет" },
  { value: "9", label: "9 палет" },
  { value: "10", label: "10 палет" },
  { value: "12", label: "12 палет" },
  { value: "14", label: "14 палет" },
];

export function isVehiclePresetValue(
  presets: VehiclePresetOption[],
  value: string,
): boolean {
  const v = value.trim();
  if (!v) return false;
  return presets.some((p) => p.value === v);
}
