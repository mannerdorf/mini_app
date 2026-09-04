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
  "LastMile",
  "lastMile",
  "Lastmile",
  "LM",
  "Expedition",
  "Expeditor",
  "Экспедиция",
] as const;

const AUTO_REG_KEYS = [
  "LMAutoReg",
  "lmAutoReg",
  "LMAUTOReg",
  "AutoReg",
  "autoReg",
  "AutoREG",
] as const;

/** Марка ТС последней мили. TypeOfTransit/TypeOfTranzit — вид перевозки (Авто/ЖД), не марка. */
const AUTO_TYPE_KEYS = [
  "LMAutoType",
  "lmAutoType",
  "AutoType",
  "autoType",
  "ТипТС",
  "Марка",
  "АвтомобильCMRНаименование",
  "Автомобиль",
] as const;

const DRIVER_KEYS = [
  "LMDriver",
  "lmDriver",
  "Driver",
  "driver",
  "DriverFio",
  "DriverName",
  "DriverFIO",
  "ExpeditorFio",
  "Экспедитор",
  "Водитель",
  "ВодительФИО",
  "ВодительCMR",
  "ВодительCMRНаименование",
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
  "ТелефонВодителяCMR",
] as const;

const JUNK_PLATE_VALUES = new Set(["авто", "auto", "—", "-", "нет", "n/a", "жд", "море"]);

export function plateWithoutRegion(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const slash = s.indexOf("/");
  return slash >= 0 ? s.slice(0, slash).trim() : s;
}

/** Госномер: буквы и цифры, не «Авто» / марка без номера из списка GetPerevozki. */
export function looksLikeVehiclePlate(raw: unknown): boolean {
  const s = plateWithoutRegion(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (JUNK_PLATE_VALUES.has(lower)) return false;
  const hasDigit = /\d/.test(s);
  const hasLetter = /[a-zA-Zа-яА-Я]/.test(s);
  return hasDigit && hasLetter && s.length >= 4 && s.length <= 15;
}

function isNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "object") return false;
  return String(value).trim() !== "";
}

function looksLikeTimelineRow(row: Record<string, unknown>): boolean {
  const stage = String(row.Stage ?? row.stage ?? row.Status ?? row.status ?? "").trim();
  const date = String(row.Date ?? row.date ?? "").trim();
  if (!stage || !date) return false;
  return !isNonEmptyValue(row.LMDriver) && !isNonEmptyValue(row.LMAutoReg) && !isNonEmptyValue(row.Driver) && !isNonEmptyValue(row.AutoReg);
}

function looksLikeNomenclatureRow(row: Record<string, unknown>): boolean {
  return Boolean(
    row.SKU ?? row.sku ?? row.Package ?? row.package ?? row.Quantity ?? row.Номенклатура ?? row.Штрихкод,
  );
}

function pushCandidate(out: Record<string, unknown>[], nested: unknown): void {
  if (Array.isArray(nested)) {
    for (const row of nested) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rec = row as Record<string, unknown>;
      if (looksLikeTimelineRow(rec) || looksLikeNomenclatureRow(rec)) continue;
      out.push(rec);
    }
    return;
  }
  if (nested && typeof nested === "object") {
    out.push(nested as Record<string, unknown>);
  }
}

function cargoRecordCandidates(item: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!item || typeof item !== "object") return [{}];
  const out: Record<string, unknown>[] = [item];
  for (const key of LAST_MILE_RECORD_KEYS) {
    pushCandidate(out, item[key]);
  }
  for (const key of ["Driver", "Expeditor", "Экспедитор", "Водитель"] as const) {
    const nested = item[key];
    if (nested && typeof nested === "object") pushCandidate(out, nested);
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
  const autoReg = looksLikeVehiclePlate(autoRegRaw) ? plateWithoutRegion(autoRegRaw) : "";
  const autoType = pickFirstField(candidates, AUTO_TYPE_KEYS);
  return {
    autoReg,
    autoType,
    driver: pickFirstField(candidates, DRIVER_KEYS),
    driverTel: pickFirstField(candidates, DRIVER_TEL_KEYS),
  };
}

/** Есть реальные поля экспедитора/авто, а не TypeOfTransit «Авто» из списка GetPerevozki. */
export function hasCargoLastMileMeta(item: Record<string, unknown> | null | undefined): boolean {
  return hasLastMileForPush(item);
}

/** Достаточно данных последней мили для push-шаблона с экспедитором/авто. */
export function hasLastMileForPush(item: Record<string, unknown> | null | undefined): boolean {
  const meta = extractCargoLastMileMeta(item);
  if (meta.driver.trim()) return true;
  return looksLikeVehiclePlate(meta.autoReg);
}

/** Overlay с LM*-полями для merge в шаблон пуша. */
export function lastMileFieldsForPushMerge(item: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const meta = extractCargoLastMileMeta(item);
  const out: Record<string, unknown> = {};
  if (meta.autoReg) {
    out.LMAutoReg = meta.autoReg;
    out.AutoReg = meta.autoReg;
  }
  if (meta.autoType) out.LMAutoType = meta.autoType;
  if (meta.driver) out.LMDriver = meta.driver;
  if (meta.driverTel) out.LMDriverTel = meta.driverTel;
  return out;
}
