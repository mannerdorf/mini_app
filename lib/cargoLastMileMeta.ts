/** Поля блока «Последняя миля» из карточки перевозки (1С / GetPerevozki / GetPerevozka). */

export type CargoLastMileMeta = {
  autoReg: string;
  autoType: string;
  driver: string;
  driverTel: string;
};

const LAST_MILE_RECORD_KEYS = [
  "Response",
  "Data",
  "Result",
  "result",
  "data",
  "items",
  "Items",
] as const;

const AUTO_REG_KEYS = [
  "LMAutoReg",
  "lmAutoReg",
  "LMAUTOReg",
  "AutoReg",
  "autoReg",
  "AutoREG",
  "Автомобиль",
  "АвтомобильCMRНаименование",
] as const;

const AUTO_TYPE_KEYS = [
  "LMAutoType",
  "lmAutoType",
  "AutoType",
  "autoType",
  "TypeOfTransit",
  "TypeOfTranzit",
  "ТипТС",
  "Марка",
] as const;

const DRIVER_KEYS = [
  "LMDriver",
  "lmDriver",
  "Driver",
  "driver",
  "DriverFio",
  "DriverName",
  "DriverFIO",
  "Expeditor",
  "ExpeditorFio",
  "Экспедитор",
  "Водитель",
  "ВодительФИО",
] as const;

const DRIVER_TEL_KEYS = [
  "LMDriverTel",
  "lmDriverTel",
  "DriverTel",
  "driverTel",
  "DriverPhone",
  "driverPhone",
  "ExpeditorTel",
  "ExpeditorPhone",
  "ТелефонВодителя",
  "ТелефонЭкспедитора",
  "Телефон",
] as const;

export function plateWithoutRegion(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const slash = s.indexOf("/");
  return slash >= 0 ? s.slice(0, slash).trim() : s;
}

function isNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return String(value).trim() !== "";
}

function cargoRecordCandidates(item: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!item || typeof item !== "object") return [{}];
  const out: Record<string, unknown>[] = [item];
  for (const key of LAST_MILE_RECORD_KEYS) {
    const nested = item[key];
    if (Array.isArray(nested)) {
      for (const row of nested) {
        if (row && typeof row === "object" && !Array.isArray(row)) out.push(row as Record<string, unknown>);
      }
      continue;
    }
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      out.push(nested as Record<string, unknown>);
    }
  }
  return out;
}

function pickFirstField(candidates: Record<string, unknown>[], keys: readonly string[]): string {
  for (const record of candidates) {
    for (const key of keys) {
      const value = record[key];
      if (isNonEmptyValue(value)) return String(value).trim();
    }
  }
  return "";
}

export function extractCargoLastMileMeta(item: Record<string, unknown> | null | undefined): CargoLastMileMeta {
  const candidates = cargoRecordCandidates(item);
  const autoRegRaw = pickFirstField(candidates, AUTO_REG_KEYS);
  const autoType = pickFirstField(candidates, AUTO_TYPE_KEYS);
  return {
    autoReg: plateWithoutRegion(autoRegRaw),
    autoType,
    driver: pickFirstField(candidates, DRIVER_KEYS),
    driverTel: pickFirstField(candidates, DRIVER_TEL_KEYS),
  };
}

export function hasCargoLastMileMeta(item: Record<string, unknown> | null | undefined): boolean {
  const meta = extractCargoLastMileMeta(item);
  return Boolean(meta.autoReg || meta.autoType || meta.driver || meta.driverTel);
}
