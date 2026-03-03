type RawRow = Record<string, unknown>;

export type NormalizedTariff = {
  docDate: string | null;
  docNumber: string;
  customerName: string;
  customerInn: string;
  cityFrom: string;
  cityTo: string;
  transportType: string;
  dangerous: boolean;
  vet: boolean;
  tariff: number | null;
  data: RawRow;
};

const ARRAY_KEYS = [
  "Items",
  "items",
  "Tarifs",
  "tarifs",
  "Tariffs",
  "tariffs",
  "Data",
  "data",
  "Result",
  "result",
  "Rows",
  "rows",
  "Value",
  "value",
  "Ответ",
  "Данные",
  "Строки",
  "Тарифы",
];

const DOC_DATE_KEYS = ["Дата", "Date", "DocDate", "date", "DocumentDate"];
const DOC_NUMBER_KEYS = ["Номер", "Number", "DocNumber", "НомерДокумента", "number"];
const CUSTOMER_NAME_KEYS = ["КлиентНаименование", "Клиент", "Customer", "CustomerName", "customer_name"];
const CUSTOMER_INN_KEYS = ["КлиентИНН", "КлиентИнн", "ИНН", "INN", "Inn", "CustomerINN", "customer_inn"];
const CITY_FROM_KEYS = ["ГородОтправления", "ГородОтпр", "CityFrom", "Откуда", "городОтправления"];
const CITY_TO_KEYS = ["ГородНазначения", "ГородНазн", "CityTo", "Куда", "городНазначения"];
const TRANSPORT_TYPE_KEYS = ["ВидПеревозки", "TransportType", "ТипПеревозки", "transport_type"];
const DANGEROUS_KEYS = ["ОГ", "ОпасныеГрузы", "Dangerous", "dangerous"];
const VET_KEYS = ["ВС", "ВетГрузы", "Vet", "vet"];
const EXCISE_KEYS = ["Акциз", "Excise", "excise"];
const TARIFF_KEYS = ["Тариф", "Tariff", "Rate", "rate", "Price", "price", "Стоимость", "Сумма"];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]/g, "");
}

function getStr(el: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

function parseNumberLike(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolLike(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "да" || normalized === "yes";
}

function getNum(el: RawRow, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumberLike(el[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function getBool(el: RawRow, keys: string[]): boolean {
  for (const key of keys) {
    if (key in el) return parseBoolLike(el[key]);
  }
  return false;
}

function isObject(value: unknown): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isTariffLikeObject(value: unknown): value is RawRow {
  if (!isObject(value)) return false;
  const keyset = new Set(Object.keys(value).map(normalizeKey));
  const hasCustomerInn = CUSTOMER_INN_KEYS.some((k) => keyset.has(normalizeKey(k)));
  const hasTariff = TARIFF_KEYS.some((k) => keyset.has(normalizeKey(k)));
  const hasNumber = DOC_NUMBER_KEYS.some((k) => keyset.has(normalizeKey(k)));
  return (hasCustomerInn && hasTariff) || hasNumber;
}

function scoreArray(arr: unknown[]): number {
  let score = 0;
  for (const item of arr) {
    if (isTariffLikeObject(item)) score += 2;
    else if (isObject(item)) score += 1;
  }
  return score;
}

function parseRawMaybeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return raw;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function extractTarifsArray(raw: unknown): RawRow[] {
  const parsedRaw = parseRawMaybeJson(raw);
  if (Array.isArray(parsedRaw)) return parsedRaw.filter(isObject);
  if (!isObject(parsedRaw)) return [];

  const stack: unknown[] = [parsedRaw];
  const seen = new Set<unknown>();
  const candidates: RawRow[][] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      const asObjects = current.filter(isObject);
      if (asObjects.length > 0) candidates.push(asObjects);
      for (const item of current) stack.push(item);
      continue;
    }

    if (!isObject(current)) continue;

    for (const key of ARRAY_KEYS) {
      const nested = current[key];
      if (Array.isArray(nested)) {
        const asObjects = nested.filter(isObject);
        if (asObjects.length > 0) candidates.push(asObjects);
      }
    }

    for (const value of Object.values(current)) {
      stack.push(parseRawMaybeJson(value));
    }
  }

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => scoreArray(b) - scoreArray(a) || b.length - a.length);
  return candidates[0];
}

export function normalizeTariffs(raw: unknown): NormalizedTariff[] {
  const arr = extractTarifsArray(raw);
  const out: NormalizedTariff[] = [];

  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    const customerInn = getStr(el, CUSTOMER_INN_KEYS);
    const tariff = getNum(el, TARIFF_KEYS);
    const docNumber = getStr(el, DOC_NUMBER_KEYS);
    if (!customerInn || tariff == null || !docNumber) continue;

    const docDateRaw = getStr(el, DOC_DATE_KEYS);
    const transportTypeRaw = getStr(el, TRANSPORT_TYPE_KEYS);
    const isExcise = getBool(el, EXCISE_KEYS);
    const vet = getBool(el, VET_KEYS);
    if (vet) continue;

    out.push({
      docDate: docDateRaw || null,
      docNumber,
      customerName: getStr(el, CUSTOMER_NAME_KEYS),
      customerInn,
      cityFrom: getStr(el, CITY_FROM_KEYS),
      cityTo: getStr(el, CITY_TO_KEYS),
      transportType: isExcise ? "Паром" : transportTypeRaw,
      dangerous: getBool(el, DANGEROUS_KEYS),
      vet,
      tariff,
      data: el,
    });
  }

  return out;
}
