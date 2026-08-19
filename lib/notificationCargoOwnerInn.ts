import { normalizeCargoNumberForLookup } from "./documentCacheNormalized.js";
import { getOrderCustomerInn } from "./orderCustomerScope.js";
import { normalizeNotificationInn } from "./notificationInnScope.js";
import { notificationItemInn } from "./notificationPoll.js";

type Queryable = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

export function notificationCargoNumber(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "";
  return String(item.Number ?? item.number ?? item.НомерПеревозки ?? item.Номер ?? "").trim();
}

/** Варианты номера для поиска в cache_perevozki_rows (000141572 ↔ 141572). */
export function cargoNumberLookupKeys(number: string): string[] {
  const raw = String(number ?? "").trim();
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  const normalized = normalizeCargoNumberForLookup(raw);
  if (normalized) {
    keys.add(normalized);
    if (/^\d+$/.test(normalized)) {
      keys.add(normalized.padStart(9, "0"));
      keys.add(normalized.padStart(6, "0"));
    }
  }
  return [...keys];
}

/** ИНН заказчика перевозки: кэш Postgres → поля 1С. */
export function resolveNotificationCargoOwnerInn(
  item: Record<string, unknown> | null | undefined,
  cacheByNumber?: ReadonlyMap<string, string>,
): string {
  const number = notificationCargoNumber(item);
  if (number && cacheByNumber?.size) {
    for (const key of cargoNumberLookupKeys(number)) {
      const cached = cacheByNumber.get(key);
      if (cached) return cached;
    }
  }

  const fromItem = notificationItemInn(item) || getOrderCustomerInn(item);
  return fromItem;
}

/** Перевозка принадлежит заказчику expectedInn (иначе — чужой груз из выборки 1С). */
export function notificationCargoBelongsToInn(
  item: Record<string, unknown> | null | undefined,
  expectedInn: string,
  cacheByNumber?: ReadonlyMap<string, string>,
): boolean {
  const expected = normalizeNotificationInn(expectedInn);
  if (!expected) return false;
  const owner = resolveNotificationCargoOwnerInn(item, cacheByNumber);
  if (!owner) return false;
  return owner === expected;
}

/** Пакетная загрузка customer_inn по номерам перевозок из normalized cache. */
export async function loadCargoCustomerInnByNumbers(
  pool: Queryable,
  cargoNumbers: string[],
): Promise<Map<string, string>> {
  const lookupKeys = new Set<string>();
  for (const number of cargoNumbers) {
    for (const key of cargoNumberLookupKeys(number)) lookupKeys.add(key);
  }
  if (lookupKeys.size === 0) return new Map();

  try {
    const { rows } = await pool.query<{ doc_number: string; customer_inn: string | null }>(
      `SELECT doc_number, customer_inn
       FROM cache_perevozki_rows
       WHERE doc_number = ANY($1::text[])
         AND customer_inn IS NOT NULL
         AND trim(customer_inn) <> ''`,
      [[...lookupKeys]],
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      const inn = normalizeNotificationInn(row.customer_inn);
      if (!inn) continue;
      for (const key of cargoNumberLookupKeys(String(row.doc_number || ""))) {
        map.set(key, inn);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
