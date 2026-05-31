export type EorStatus = "entry_allowed" | "full_inspection" | "turnaround";

export const EOR_STATUS_OPTIONS: { value: EorStatus; label: string }[] = [
  { value: "entry_allowed", label: "Въезд разрешен" },
  { value: "full_inspection", label: "Полный досмотр" },
  { value: "turnaround", label: "Разворот" },
];
