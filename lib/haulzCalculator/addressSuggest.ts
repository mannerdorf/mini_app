import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { dadataSuggestAddresses } from "../dadata/suggestAddress.js";
import { dgisReadCache, dgisWriteCache } from "./dgisClient.js";

export type DgisSuggestItem = {
  id?: string;
  fullAddress: string;
  label: string;
  point?: GeoPoint;
  city?: string;
};

/** Совместимость с клиентом калькулятора. */
export type AddressSuggestItem = DgisSuggestItem & { uri?: string };

function readCachedItems(cached: unknown): AddressSuggestItem[] | null {
  if (Array.isArray(cached)) return cached as AddressSuggestItem[];
  if (cached && typeof cached === "object" && "items" in cached) {
    const items = (cached as { items?: AddressSuggestItem[] }).items;
    if (Array.isArray(items)) return items;
  }
  return null;
}

/** Подсказки адреса через DaData Suggest (координаты из geo_lat/lon, если есть). */
export async function suggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
  pool: Pool | null = null,
): Promise<AddressSuggestItem[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const cacheKey = `suggest:dadata:v2:${opts.city || "any"}:${query.toLowerCase()}`;
  const cached = await dgisReadCache(pool, cacheKey);
  const fromCache = cached ? readCachedItems(cached) : null;
  if (fromCache && fromCache.length > 0) return fromCache;

  const items = await dadataSuggestAddresses(query, opts);
  const result: AddressSuggestItem[] = items.slice(0, 12).map((item) => ({
    id: item.id,
    uri: item.id,
    fullAddress: item.fullAddress,
    label: item.label,
    point: item.point,
  }));

  await dgisWriteCache(pool, cacheKey, "suggest", { items: result }, 12);
  return result;
}
