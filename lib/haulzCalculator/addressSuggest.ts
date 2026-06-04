import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { dgisFetchJson, dgisGeocode, dgisReadCache, dgisWriteCache, getDgisApiKey } from "./dgisClient.js";

const SUGGEST_URL = "https://catalog.api.2gis.com/3.0/suggests";

export type DgisSuggestItem = {
  id?: string;
  fullAddress: string;
  label: string;
  point?: GeoPoint;
  city?: string;
};

function parsePointFromItem(it: Record<string, unknown>): GeoPoint | undefined {
  const pointRaw = it.point as { lat?: number; lon?: number } | undefined;
  let lat = Number(pointRaw?.lat);
  let lon = Number(pointRaw?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };

  const geom = it.geometry as Record<string, unknown> | undefined;
  const centroid = geom?.centroid;
  if (centroid && typeof centroid === "object") {
    lat = Number((centroid as { lat?: number }).lat);
    lon = Number((centroid as { lon?: number }).lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return undefined;
}

export function normalizeSuggestResponse(data: unknown, cityHint?: string): DgisSuggestItem[] {
  const items = (data as { result?: { items?: unknown[] } })?.result?.items;
  if (!Array.isArray(items)) return [];
  const out: DgisSuggestItem[] = [];
  const cityNeedle =
    cityHint === "kaliningrad" ? "калининград" : cityHint === "moscow" ? "москва" : null;

  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const type = String(it.type ?? "").toLowerCase();
    if (type === "user_query") continue;

    const fullAddress = String(
      it.full_address_name ?? it.full_name ?? it.address_name ?? it.name ?? "",
    ).trim();
    const label = String(it.name ?? fullAddress).trim();
    if (!label && !fullAddress) continue;

    const addrLower = `${fullAddress} ${label}`.toLowerCase();
    if (cityNeedle && !addrLower.includes(cityNeedle) && !addrLower.includes("kaliningrad") && cityNeedle === "калининград") {
      // мягкий фильтр: пропускаем явно другие города
      if (addrLower.includes("москва") || addrLower.includes("санкт-петербург")) continue;
    }
    if (cityNeedle === "москва" && (addrLower.includes("калининград") || addrLower.includes("санкт-петербург"))) {
      continue;
    }

    out.push({
      id: typeof it.id === "string" ? it.id : undefined,
      fullAddress: fullAddress || label,
      label,
      point: parsePointFromItem(it),
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
    locale: "ru_RU",
    fields:
      "items.point,items.full_address_name,items.address,items.adm_div,items.geometry.centroid,items.name,items.type",
    page_size: "10",
  });
  if (city === "moscow") params.set("location", "37.6173,55.7558");
  else if (city === "kaliningrad") params.set("location", "20.5103,54.7104");

  return dgisFetchJson(`${SUGGEST_URL}?${params}`, undefined, 8000);
}

async function enrichWithGeocode(
  items: DgisSuggestItem[],
  pool: Pool | null,
  limit = 3,
): Promise<DgisSuggestItem[]> {
  const out: DgisSuggestItem[] = [];
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
    const pt = await dgisGeocode(item.fullAddress, pool);
    geocoded++;
    out.push(pt ? { ...item, point: pt } : item);
  }
  return out;
}

/**
 * Подсказки адреса: address, при пустой выдаче — route_endpoint; без города — повтор без location.
 */
export async function suggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
  pool: Pool | null = null,
): Promise<DgisSuggestItem[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const cacheKey = `suggest:v2:${opts.city || "any"}:${query.toLowerCase()}`;
  const cached = await dgisReadCache(pool, cacheKey);
  if (cached) return normalizeSuggestResponse(cached, opts.city);

  let data = await fetchSuggestRaw(query, "address", opts.city);
  let items = normalizeSuggestResponse(data, opts.city);

  if (items.length === 0) {
    data = await fetchSuggestRaw(query, "route_endpoint", opts.city);
    items = normalizeSuggestResponse(data, opts.city);
  }

  if (items.length === 0 && opts.city) {
    data = await fetchSuggestRaw(query, "address", undefined);
    items = normalizeSuggestResponse(data, opts.city);
  }

  items = await enrichWithGeocode(items, pool, 4);

  await dgisWriteCache(pool, cacheKey, "suggest", data, 24);
  return items;
}
