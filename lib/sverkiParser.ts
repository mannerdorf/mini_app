type RawRow = Record<string, unknown>;

export type NormalizedSverka = {
  docNumber: string;
  docDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  customerName: string;
  customerInn: string;
  data: RawRow;
};

const ARRAY_KEYS = [
  "Items",
  "items",
  "Data",
  "data",
  "Result",
  "result",
  "Rows",
  "rows",
  "Value",
  "value",
  "АктыСверок",
  "Сверки",
];

const DOC_NUMBER_KEYS = ["Номер", "Number", "DocNumber", "НомерДокумента"];
const DOC_DATE_KEYS = ["Дата", "Date", "DocDate", "ДатаДокумента"];
const PERIOD_FROM_KEYS = ["ДатаНачала", "DateFrom", "PeriodFrom", "НачалоПериода"];
const PERIOD_TO_KEYS = ["ДатаОкончания", "DateTo", "PeriodTo", "КонецПериода"];
const CUSTOMER_NAME_KEYS = ["КонтрагентНаименование", "Контрагент", "CustomerName", "Customer"];
const CUSTOMER_INN_KEYS = ["КонтрагентИНН", "КонтрагентИнн", "ИНН", "INN", "Inn", "CustomerINN"];

function isObject(value: unknown): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getStr(el: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]/g, "");
}

function isSverkaLikeObject(value: unknown): value is RawRow {
  if (!isObject(value)) return false;
  const keyset = new Set(Object.keys(value).map(normalizeKey));
  const hasNumber = DOC_NUMBER_KEYS.some((k) => keyset.has(normalizeKey(k)));
  const hasInn = CUSTOMER_INN_KEYS.some((k) => keyset.has(normalizeKey(k)));
  return hasNumber && hasInn;
}

function scoreArray(arr: unknown[]): number {
  let score = 0;
  for (const item of arr) {
    if (isSverkaLikeObject(item)) score += 2;
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

function extractSverkiArray(raw: unknown): RawRow[] {
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

export function normalizeSverki(raw: unknown): NormalizedSverka[] {
  const arr = extractSverkiArray(raw);
  const out: NormalizedSverka[] = [];

  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    const docNumber = getStr(el, DOC_NUMBER_KEYS);
    const customerInn = getStr(el, CUSTOMER_INN_KEYS);
    if (!docNumber || !customerInn) continue;

    out.push({
      docNumber,
      docDate: getStr(el, DOC_DATE_KEYS) || null,
      periodFrom: getStr(el, PERIOD_FROM_KEYS) || null,
      periodTo: getStr(el, PERIOD_TO_KEYS) || null,
      customerName: getStr(el, CUSTOMER_NAME_KEYS),
      customerInn,
      data: el,
    });
  }

  return out;
}
