/** Варианты срока оплаты (календарных дней с момента выставления счёта) в платёжном календаре */
export const PAYMENT_DAYS_OPTIONS = [0, 3, 5, 7, 14, 21, 30, 45, 60, 90];

/** Платежные дни недели — только рабочие (1=пн … 5=пт). Выходные не допускаются. */
export const PAYMENT_WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
];
