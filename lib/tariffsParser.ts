type RawRow = Record<string, unknown>;

export type NormalizedTariff = {
  code: string;
  name: string;
  value: number | null;
  unit: string;
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

const CODE_KEYS = [
  "Code",
  "code",
  "Id",
  "id",
  "ID",
  "Ref_Key",
  "ref_key",
  "Код",
  "КодТарифа",
  "КодТарифа1С",
  "TariffCode",
  "TarifCode",
];

const NAME_KEYS = [
  "Name",
  "name",
  "Title",
  "title",
  "Description",
  "description",
  "Наименование",
  "НаименованиеТарифа",
  "Тариф",
  "Tariff",
  "Tarif",
  "ServiceName",
  "Service",
  "Услуга",
  "ВидРабот",
  "ВидРаботы",
];

const VALUE_KEYS = [
  "Value",
  "value",
  "Price",
  "price",
  "Cost",
  "cost",
  "Rate",
  "rate",
  "Amount",
  "amount",
  "Sum",
  "sum",
  "Тариф",
  "Сумма",
  "Цена",
  "Стоимость",
  "Ставка",
  "Значение",
];

const UNIT_KEYS = [
  "Unit",
  "unit",
  "Measure",
  "measure",
  "Единица",
  "Ед",
  "ед",
  "ЕдиницаИзмерения",
];

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

function getNum(el: RawRow, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumberLike(el[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function isObject(value: unknown): value is RawRow {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isTariffLikeObject(value: unknown): value is RawRow {
  if (!isObject(value)) return false;
  const keyset = new Set(Object.keys(value).map(normalizeKey));
  const hasName = NAME_KEYS.some((k) => keyset.has(normalizeKey(k)));
  const hasCode = CODE_KEYS.some((k) => keyset.has(normalizeKey(k)));
  const hasValue = VALUE_KEYS.some((k) => keyset.has(normalizeKey(k)));
  return hasName || (hasCode && hasValue);
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
    const code = getStr(el, CODE_KEYS) || String(i + 1);
    const name = getStr(el, NAME_KEYS);
    const value = getNum(el, VALUE_KEYS);
    const unit = getStr(el, UNIT_KEYS);

    if (!name && value == null && !getStr(el, CODE_KEYS)) continue;
    out.push({ code, name, value, unit, data: el });
  }

  return out;
}
