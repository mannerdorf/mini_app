import { cargoNumberLookupKeys, notificationCargoNumber } from "./notificationCargoOwnerInn.js";
import { normalizeCargoNumberForLookup } from "./documentCacheNormalized.js";
import { hasCargoLastMileMeta } from "./cargoLastMileMeta.js";
import { fetchPerevozkaRecordForPush } from "./fetchPerevozkaLastMile.js";
import type { CargoEvent } from "./notificationPoll.js";
import type { CargoStageEventId } from "./notificationCargoEvents.js";

type Queryable = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

const LAST_MILE_PUSH_EVENTS = new Set<CargoEvent | CargoStageEventId>([
  "delivery_scheduled",
  "delivered",
  "arrived",
]);

function isNonEmptyFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return String(value).trim() !== "";
}

/** Объединяет записи перевозки: непустые поля из overlay дополняют primary. */
export function mergeCargoItemForPushTemplate(
  primary: Record<string, unknown>,
  ...overlays: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...primary };
  for (const overlay of overlays) {
    if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) continue;
    for (const [key, value] of Object.entries(overlay)) {
      if (!isNonEmptyFieldValue(value)) continue;
      const current = merged[key];
      if (!isNonEmptyFieldValue(current)) merged[key] = value;
    }
  }
  return merged;
}

/** Пакетная загрузка payload перевозок из cache_perevozki_rows. */
export async function loadCargoPayloadsByNumbers(
  pool: Queryable,
  cargoNumbers: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const lookupKeys = new Set<string>();
  const normalizedKeys = new Set<string>();
  for (const number of cargoNumbers) {
    for (const key of cargoNumberLookupKeys(number)) lookupKeys.add(key);
    const normalized = normalizeCargoNumberForLookup(number);
    if (normalized) normalizedKeys.add(normalized);
  }
  const byNumber = new Map<string, Record<string, unknown>>();
  if (lookupKeys.size === 0) return byNumber;

  try {
    const { rows } = await pool.query<{ doc_number: string; payload: unknown }>(
      `SELECT doc_number, payload
       FROM cache_perevozki_rows
       WHERE (
         doc_number = ANY($1::text[])
         OR ltrim(regexp_replace(coalesce(doc_number, ''), '^0000-', ''), '0') = ANY($2::text[])
       )`,
      [[...lookupKeys], [...normalizedKeys]],
    );
    for (const row of rows) {
      const payload =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null;
      if (!payload) continue;
      for (const key of cargoNumberLookupKeys(String(row.doc_number || ""))) {
        byNumber.set(key, payload);
      }
    }
  } catch {
    return byNumber;
  }
  return byNumber;
}

export function resolveCachedCargoPayload(
  item: Record<string, unknown>,
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const number = notificationCargoNumber(item);
  if (!number) return null;
  for (const key of cargoNumberLookupKeys(number)) {
    const hit = payloadByNumber.get(key);
    if (hit) return hit;
  }
  return null;
}

export function enrichCargoItemForPushTemplate(
  item: Record<string, unknown>,
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const cached = resolveCachedCargoPayload(item, payloadByNumber);
  return cached ? mergeCargoItemForPushTemplate(item, cached) : item;
}

export function shouldFetchPerevozkaLastMileForPush(
  event: CargoEvent | CargoStageEventId,
  item: Record<string, unknown>,
): boolean {
  if (!LAST_MILE_PUSH_EVENTS.has(event)) return false;
  return !hasCargoLastMileMeta(item);
}

function perevozkaCacheKey(cargoNumber: string, customerInn: string): string {
  return `${cargoNumber}::${customerInn}`;
}

/** Готовит запись перевозки для push-шаблона: cache → merge → при необходимости GetPerevozka. */
export async function resolveCargoItemForPushTemplate(params: {
  item: Record<string, unknown>;
  event: CargoEvent | CargoStageEventId;
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>;
  customerInn?: string;
  serviceLogin?: string;
  servicePassword?: string;
  perevozkaCache?: Map<string, Record<string, unknown> | null>;
}): Promise<Record<string, unknown>> {
  let merged = enrichCargoItemForPushTemplate(params.item, params.payloadByNumber);
  if (!shouldFetchPerevozkaLastMileForPush(params.event, merged)) return merged;

  const cargoNumber = notificationCargoNumber(merged);
  const customerInn = String(params.customerInn || "").trim();
  const login = String(params.serviceLogin || "").trim();
  const password = String(params.servicePassword || "").trim();
  if (!cargoNumber || !login || !password) return merged;

  const cacheKey = perevozkaCacheKey(cargoNumber, customerInn);
  const cache = params.perevozkaCache;
  if (cache?.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (cached) merged = mergeCargoItemForPushTemplate(merged, cached);
    return merged;
  }

  const detail = await fetchPerevozkaRecordForPush({
    cargoNumber,
    customerInn,
    serviceLogin: login,
    servicePassword: password,
  });
  if (cache) cache.set(cacheKey, detail);
  if (detail) merged = mergeCargoItemForPushTemplate(merged, detail);
  return merged;
}
