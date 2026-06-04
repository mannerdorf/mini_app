import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { dgisFetchJson, dgisReadCache, dgisWriteCache, getDgisApiKey } from "./dgisClient.js";

const SUGGEST_URL = "https://catalog.api.2gis.com/3.0/suggests";

export type DgisSuggestItem = {
  id?: string;
  fullAddress: string;
  label: string;
  point?: GeoPoint;
  city?: string;
};

export function normalizeSuggestResponse(data: unknown): DgisSuggestItem[] {
  const items = (data as { result?: { items?: unknown[] } })?.result?.items;
  if (!Array.isArray(items)) return [];
  const out: DgisSuggestItem[] = [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const pointRaw = it.point as { lat?: number; lon?: number } | undefined;
    const lat = Number(pointRaw?.lat);
    const lon = Number(pointRaw?.lon);
    const fullAddress = String(it.full_address_name || it.address_name || it.name || "").trim();
    const label = String(it.name || fullAddress).trim();
    if (!label) continue;
    out.push({
      id: typeof it.id === "string" ? it.id : undefined,
      fullAddress: fullAddress || label,
      label,
      point: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined,
    });
  }
  return out;
}

async function fetchSuggestRaw(
  q: string,
  suggestType: "address" | "route_endpoint",
  city?: "moscow" | "kaliningrad",
): Promise<unknown> {
  const key = getDgisApiKey();
  const params = new URLSearchParams({
    key,
    q,
    suggest_type: suggestType,
    fields: "items.point,items.full_address_name,items.address,items.adm_div",
    page_size: "8",
  });
  if (city === "moscow") params.set("sort_point", "37.6173,55.7558");
  else if (city === "kaliningrad") params.set("sort_point", "20.5103,54.7104");
  return dgisFetchJson(`${SUGGEST_URL}?${params}`, undefined, 8000);
}

/**
 * Подсказки адреса: address, при пустой выдаче — route_endpoint (как в плане 2GIS).
 */
export async function suggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
  pool: Pool | null = null,
): Promise<DgisSuggestItem[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const cacheKey = `suggest:${opts.city || "any"}:${query.toLowerCase()}`;
  const cached = await dgisReadCache(pool, cacheKey);
  if (cached) return normalizeSuggestResponse(cached);

  let data = await fetchSuggestRaw(query, "address", opts.city);
  let items = normalizeSuggestResponse(data);
  if (items.length === 0) {
    data = await fetchSuggestRaw(query, "route_endpoint", opts.city);
    items = normalizeSuggestResponse(data);
  }

  await dgisWriteCache(pool, cacheKey, "suggest", data, 24);
  return items;
}
