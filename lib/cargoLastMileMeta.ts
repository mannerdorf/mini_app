/** Поля блока «Последняя миля» из карточки перевозки (1С / GetPerevozki). */

export type CargoLastMileMeta = {
  autoReg: string;
  autoType: string;
  driver: string;
  driverTel: string;
};

export function plateWithoutRegion(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const slash = s.indexOf("/");
  return slash >= 0 ? s.slice(0, slash).trim() : s;
}

export function extractCargoLastMileMeta(item: Record<string, unknown> | null | undefined): CargoLastMileMeta {
  const anyItem = item && typeof item === "object" ? item : {};
  return {
    autoReg: plateWithoutRegion(anyItem.LMAutoReg ?? anyItem.AutoReg ?? anyItem.autoReg ?? anyItem.AutoREG),
    autoType: String(anyItem.LMAutoType ?? anyItem.AutoType ?? anyItem.autoType ?? "").trim(),
    driver: String(anyItem.LMDriver ?? anyItem.Driver ?? anyItem.driver ?? anyItem.DriverFio ?? anyItem.DriverName ?? "").trim(),
    driverTel: String(anyItem.LMDriverTel ?? anyItem.DriverTel ?? anyItem.driverTel ?? "").trim(),
  };
}
