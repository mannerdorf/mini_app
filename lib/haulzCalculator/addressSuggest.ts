import type { Pool } from "pg";
import {
  geoReadCache,
  geoWriteCache,
  yandexGeocode,
  type AddressSuggestItem,
} from "./yandexClient.js";
import { prepareSuggestQuery, yandexSuggestAddresses } from "./yandexSuggest.js";

export type { AddressSuggestItem } from "./yandexClient.js";
/** @deprecated */
export type DgisSuggestItem = AddressSuggestItem;

async function enrichWithGeocode(
  items: AddressSuggestItem[],
  pool: Pool | null,
  city?: "moscow" | "kaliningrad",
  limit = 8,
): Promise<AddressSuggestItem[]> {
  const out: AddressSuggestItem[] = [];
  let geocoded = 0;

  for (const item of items) {
    if (item.point) {
      out.push(item);
      continue;
    }
    if (geocoded >= limit) {
      out.push(item);
      continue;
    }
    const resolved = await yandexGeocode(item.fullAddress, pool, { city, uri: item.uri });
    geocoded++;
    out.push(
      resolved
        ? { ...item, point: resolved.point, fullAddress: resolved.formatted || item.fullAddress }
        : item,
    );
  }
  return out;
}

function readCachedItems(cached: unknown): AddressSuggestItem[] | null {
  if (Array.isArray(cached)) return cached as AddressSuggestItem[];
  if (cached && typeof cached === "object" && "items" in cached) {
    const items = (cached as { items?: AddressSuggestItem[] }).items;
    if (Array.isArray(items)) return items;
  }
  return null;
}

/** Подсказки адреса через Yandex Geosuggest + Geocoder. */
export async function suggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
  pool: Pool | null = null,
): Promise<AddressSuggestItem[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const apiQuery = prepareSuggestQuery(query, opts.city);
  const cacheKey = `suggest:yandex:v1:${opts.city || "any"}:${apiQuery.toLowerCase()}`;
  const cached = await geoReadCache(pool, cacheKey);
  const fromCache = cached ? readCachedItems(cached) : null;
  if (fromCache && fromCache.length > 0) return fromCache;

  let items = await yandexSuggestAddresses(apiQuery, opts);
  if (items.length === 0 && apiQuery !== query) {
    items = await yandexSuggestAddresses(query, opts);
  }

  items = await enrichWithGeocode(items, pool, opts.city, 8);
  items = items.slice(0, 12);

  await geoWriteCache(pool, cacheKey, "suggest", { items }, 12);
  return items;
}

/** @deprecated — оставлено для тестов нормализации 2GIS; больше не используется в проде. */
export function normalizeSuggestResponse(): AddressSuggestItem[] {
  return [];
}
