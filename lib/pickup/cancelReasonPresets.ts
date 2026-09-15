export type CancelReasonPreset = { value: string; label: string };

export const PICKUP_CANCEL_REASON_PRESETS: CancelReasonPreset[] = [
  { value: "Ошибочно создан", label: "Ошибочно создан" },
  { value: "Заказчик отменил забор", label: "Заказчик отменил" },
  { value: "Отправитель не готов / нет груза", label: "Нет груза / не готов" },
  { value: "Неверный адрес или окно времени", label: "Неверный адрес или время" },
  { value: "Перенос на другую дату", label: "Перенос на другую дату" },
  { value: "Дубль заявки", label: "Дубль заявки" },
  { value: "Не успеваем по маршруту", label: "Не успеваем по маршруту" },
];

export function isPresetCancelReason(value: string): boolean {
  const v = value.trim();
  return PICKUP_CANCEL_REASON_PRESETS.some((p) => p.value === v);
}
