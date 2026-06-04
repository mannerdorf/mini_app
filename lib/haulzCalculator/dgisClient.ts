import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { suggestAddresses, type DgisSuggestItem } from "./addressSuggest.js";

export type { DgisSuggestItem } from "./addressSuggest.js";

const GEOCODE_URL = "https://catalog.api.2gis.com/3.0/items/geocode";
const ROUTING_URL = "https://routing.api.2gis.com/routing/7.0.0/global";

export function getDgisApiKey(): string {
  const k = String(process.env.HAULZ_DGIS_API_KEY || process.env.DGIS_API_KEY || "").trim();
  if (!k) throw new Error("HAULZ_DGIS_API_KEY не задан");
  return k;
}

export async function dgisReadCache(pool: Pool | null, cacheKey: string): Promise<unknown | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ response: unknown }>(
    `select response from haulz_calc_api_cache where cache_key = $1 and expires_at > now()`,
    [cacheKey],
  );
  return rows[0]?.response ?? null;
}

export async function dgisWriteCache(
  pool: Pool | null,
  cacheKey: string,
  kind: "suggest" | "geocode" | "routing",
  response: unknown,
  ttlHours: number,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `insert into haulz_calc_api_cache (cache_key, kind, response, expires_at)
     values ($1, $2, $3::jsonb, now() + ($4::text || ' hours')::interval)
     on conflict (cache_key) do update set
       kind = excluded.kind,
       response = excluded.response,
       expires_at = excluded.expires_at`,
    [cacheKey, kind, JSON.stringify(response), String(ttlHours)],
  );
}

export async function dgisFetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { error?: { message?: string } })?.error?.message;
      throw new Error(err || `2GIS HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

/** @deprecated Используйте suggestAddresses из addressSuggest.ts */
export async function dgisSuggest(
  q: string,
  opts: { city?: "moscow" | "kaliningrad"; limit?: number },
  pool: Pool | null = null,
): Promise<DgisSuggestItem[]> {
  const items = await suggestAddresses(q, { city: opts.city }, pool);
  const limit = opts.limit ?? 8;
  return items.slice(0, limit);
}

export async function dgisGeocode(address: string, pool: Pool | null = null): Promise<GeoPoint | null> {
  const q = String(address || "").trim();
  if (!q) return null;
  const cacheKey = `geocode:${q.toLowerCase()}`;
  const cached = await dgisReadCache(pool, cacheKey);
  if (cached) return pointFromGeocode(cached);

  const key = getDgisApiKey();
  const params = new URLSearchParams({ key, q });
  const data = await dgisFetchJson(`${GEOCODE_URL}?${params}`, undefined, 12000);
  await dgisWriteCache(pool, cacheKey, "geocode", data, 24);
  return pointFromGeocode(data);
}

function pointFromGeocode(data: unknown): GeoPoint | null {
  const items = (data as { result?: { items?: unknown[] } })?.result?.items;
  const first = Array.isArray(items) ? (items[0] as Record<string, unknown>) : null;
  const point = first?.point as { lat?: number; lon?: number } | undefined;
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export async function dgisRouteKm(from: GeoPoint, to: GeoPoint, pool: Pool | null = null): Promise<number> {
  const cacheKey = `route:${from.lat},${from.lon}:${to.lat},${to.lon}`;
  const cached = await dgisReadCache(pool, cacheKey);
  if (cached) return kmFromRouting(cached);

  const key = getDgisApiKey();
  const body = {
    points: [
      { type: "stop", lon: from.lon, lat: from.lat },
      { type: "stop", lon: to.lon, lat: to.lat },
    ],
    transport: "car",
    route_mode: "fastest",
    traffic_mode: "statistics",
    output: "summary",
  };
  const data = await dgisFetchJson(
    `${ROUTING_URL}?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    30000,
  );
  await dgisWriteCache(pool, cacheKey, "routing", data, 24);
  return kmFromRouting(data);
}

function kmFromRouting(data: unknown): number {
  const routes = (data as { result?: { routes?: { length?: number }[] } })?.result?.routes;
  const lengthM = Array.isArray(routes) && routes[0] ? Number(routes[0].length) : NaN;
  if (!Number.isFinite(lengthM) || lengthM <= 0) throw new Error("2GIS routing: нет длины маршрута");
  return lengthM / 1000;
}
