import { normalizeCargoNumberForLookup } from "./documentCacheNormalized.js";
import { getOrderCustomerInn } from "./orderCustomerScope.js";
import { loginAllowsPushInn, normalizeNotificationInn, type PushLoginScope } from "./notificationInnScope.js";
import { notificationItemInn } from "./notificationPoll.js";

export type CargoCustomerInnCache = {
  byNumber: Map<string, string>;
  loaded: boolean;
};

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

/** ИНН заказчика перевозки: только cache_perevozki_rows (strict) или cache → поля 1С. */
export function resolveNotificationCargoOwnerInn(
  item: Record<string, unknown> | null | undefined,
  cacheByNumber?: ReadonlyMap<string, string>,
  opts?: { strictCache?: boolean },
): string {
  const number = notificationCargoNumber(item);
  if (number && cacheByNumber) {
    for (const key of cargoNumberLookupKeys(number)) {
      const cached = cacheByNumber.get(key);
      if (cached) return cached;
    }
    if (opts?.strictCache) return "";
  }

  if (opts?.strictCache) return "";
  const fromItem = notificationItemInn(item) || getOrderCustomerInn(item);
  return fromItem;
}

/** Перевозка принадлежит заказчику expectedInn (иначе — чужой груз из выборки 1С). */
export function notificationCargoBelongsToInn(
  item: Record<string, unknown> | null | undefined,
  expectedInn: string,
  cacheByNumber?: ReadonlyMap<string, string>,
  opts?: { cacheLoaded?: boolean },
): boolean {
  const expected = normalizeNotificationInn(expectedInn);
  if (!expected) return false;
  const owner = resolveNotificationCargoOwnerInn(item, cacheByNumber, {
    strictCache: opts?.cacheLoaded === true,
  });
  if (!owner) return false;
  return owner === expected;
}

/** Можно ли слать уведомление подписчику: ИНН перевозки = ИНН в скоупе login. */
export function shouldDeliverNotificationToSubscriber(params: {
  subscriberInn: string;
  cargoInn: string;
  loginScope?: PushLoginScope | null;
}): boolean {
  const subscriberInn = normalizeNotificationInn(params.subscriberInn);
  const cargoInn = normalizeNotificationInn(params.cargoInn);
  if (!subscriberInn || !cargoInn || subscriberInn !== cargoInn) return false;
  if (params.loginScope && !loginAllowsPushInn(params.loginScope, cargoInn)) return false;
  return true;
}

/** Пакетная загрузка customer_inn по номерам перевозок из normalized cache. */
export async function loadCargoCustomerInnByNumbers(
  pool: Queryable,
  cargoNumbers: string[],
): Promise<CargoCustomerInnCache> {
  const lookupKeys = new Set<string>();
  const normalizedKeys = new Set<string>();
  for (const number of cargoNumbers) {
    for (const key of cargoNumberLookupKeys(number)) lookupKeys.add(key);
    const normalized = normalizeCargoNumberForLookup(number);
    if (normalized) normalizedKeys.add(normalized);
  }
  if (lookupKeys.size === 0) return { byNumber: new Map(), loaded: true };

  try {
    const { rows } = await pool.query<{ doc_number: string; customer_inn: string | null }>(
      `SELECT doc_number, customer_inn
       FROM cache_perevozki_rows
       WHERE (
         doc_number = ANY($1::text[])
         OR ltrim(regexp_replace(coalesce(doc_number, ''), '^0000-', ''), '0') = ANY($2::text[])
       )
         AND customer_inn IS NOT NULL
         AND trim(customer_inn) <> ''`,
      [[...lookupKeys], [...normalizedKeys]],
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      const inn = normalizeNotificationInn(row.customer_inn);
      if (!inn) continue;
      for (const key of cargoNumberLookupKeys(String(row.doc_number || ""))) {
        map.set(key, inn);
      }
    }
    return { byNumber: map, loaded: true };
  } catch {
    return { byNumber: new Map(), loaded: false };
  }
}
