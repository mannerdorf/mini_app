import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";

const GEOCODE_URL = "https://geocode-maps.yandex.ru/v1/";

export type AddressSuggestItem = {
  id?: string;
  uri?: string;
  label: string;
  fullAddress: string;
  point?: GeoPoint;
};

/** API Геокодера — координаты и обратное геокодирование. */
export function getYandexGeocoderApiKey(): string {
  const k = String(process.env.HAULZ_YANDEX_GEOCODER_API_KEY || "").trim();
  if (!k) throw new Error("HAULZ_YANDEX_GEOCODER_API_KEY не задан");
  return k;
}

/** JavaScript API — карта выбора точки. */
export function getYandexMapsPublicKey(): string | null {
  const k = String(process.env.HAULZ_YANDEX_MAPS_API_KEY || "").trim();
  return k || null;
}

export async function geoReadCache(pool: Pool | null, cacheKey: string): Promise<unknown | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ response: unknown }>(
    `select response from haulz_calc_api_cache where cache_key = $1 and expires_at > now()`,
    [cacheKey],
  );
  return rows[0]?.response ?? null;
}

export async function geoWriteCache(
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

export async function yandexFetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err =
        (data as { message?: string; errors?: string[] })?.message ||
        (data as { errors?: string[] })?.errors?.[0];
      throw new Error(err || `Yandex HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

function pointFromGeocoderResponse(data: unknown): GeoPoint | null {
  const member = (data as { response?: { GeoObjectCollection?: { featureMember?: unknown[] } } })?.response
    ?.GeoObjectCollection?.featureMember?.[0] as { GeoObject?: { Point?: { pos?: string } } } | undefined;
  const pos = member?.GeoObject?.Point?.pos;
  if (!pos) return null;
  const [lonS, latS] = pos.split(/\s+/);
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function formattedAddressFromGeocoder(data: unknown): string | null {
  const member = (data as { response?: { GeoObjectCollection?: { featureMember?: unknown[] } } })?.response
    ?.GeoObjectCollection?.featureMember?.[0] as {
    GeoObject?: { metaDataProperty?: { GeocoderMetaData?: { text?: string; Address?: { formatted?: string } } } };
  } | undefined;
  const meta = member?.GeoObject?.metaDataProperty?.GeocoderMetaData;
  return String(meta?.text || meta?.Address?.formatted || "").trim() || null;
}

const CITY_BBOX: Record<"moscow" | "kaliningrad", string> = {
  moscow: "37.319,55.489~37.967,55.957",
  kaliningrad: "20.350,54.620~20.750,54.820",
};

export async function yandexGeocode(
  query: string,
  pool: Pool | null = null,
  opts?: { city?: "moscow" | "kaliningrad"; uri?: string },
): Promise<{ point: GeoPoint; formatted: string } | null> {
  const uri = opts?.uri?.trim();
  const address = String(query || "").trim();
  if (!uri && !address) return null;

  const cacheKey = `ygeocode:${opts?.city || "any"}:${uri || address.toLowerCase()}`;
  const cached = await geoReadCache(pool, cacheKey);
  if (cached) {
    const pt = pointFromGeocoderResponse(cached);
    const formatted = formattedAddressFromGeocoder(cached);
    if (pt) return { point: pt, formatted: formatted || address };
  }

  const key = getYandexGeocoderApiKey();
  const params = new URLSearchParams({
    apikey: key,
    format: "json",
    lang: "ru_RU",
    results: "1",
  });
  if (uri) params.set("uri", uri);
  else {
    params.set("geocode", address);
    if (opts?.city) {
      params.set("bbox", CITY_BBOX[opts.city]);
      params.set("rspn", "1");
    }
  }

  const data = await yandexFetchJson(`${GEOCODE_URL}?${params}`, undefined, 12000);
  await geoWriteCache(pool, cacheKey, "geocode", data, 24);
  const point = pointFromGeocoderResponse(data);
  if (!point) return null;
  return { point, formatted: formattedAddressFromGeocoder(data) || address };
}

/** Обратное геокодирование: координаты → адрес (для выбора на карте). */
export async function yandexReverseGeocode(
  point: GeoPoint,
  pool: Pool | null = null,
): Promise<{ point: GeoPoint; formatted: string } | null> {
  const cacheKey = `yrev:${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
  const cached = await geoReadCache(pool, cacheKey);
  if (cached) {
    const formatted = formattedAddressFromGeocoder(cached);
    const pt = pointFromGeocoderResponse(cached);
    if (formatted && pt) return { point: pt, formatted };
  }

  const key = getYandexGeocoderApiKey();
  const geocode = `${point.lon},${point.lat}`;
  const params = new URLSearchParams({
    apikey: key,
    geocode,
    format: "json",
    lang: "ru_RU",
    results: "1",
    kind: "house",
  });
  const data = await yandexFetchJson(`${GEOCODE_URL}?${params}`, undefined, 12000);
  await geoWriteCache(pool, cacheKey, "geocode", data, 24);
  const pt = pointFromGeocoderResponse(data) || point;
  const formatted = formattedAddressFromGeocoder(data);
  if (!formatted) return null;
  return { point: pt, formatted };
}

