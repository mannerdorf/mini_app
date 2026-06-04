import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { geoReadCache, geoWriteCache } from "./yandexClient.js";

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/**
 * Дорожное расстояние, км (как «РасстояниеПОГИС» в 1С через 2GIS Routing).
 * OSRM — бесплатно, без ключа; при ошибке — null (кандидат не учитывается).
 */
export async function roadRouteKm(
  from: GeoPoint,
  to: GeoPoint,
  pool: Pool | null = null,
): Promise<number | null> {
  const cacheKey = `osrm:${from.lat.toFixed(5)},${from.lon.toFixed(5)}:${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  const cached = await geoReadCache(pool, cacheKey);
  if (cached && typeof cached === "object" && cached !== null && "km" in cached) {
    const km = Number((cached as { km: number }).km);
    if (Number.isFinite(km)) return km;
  }

  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = (await res.json().catch(() => ({}))) as {
      routes?: { distance?: number }[];
    };
    if (!res.ok || !data.routes?.[0]) return null;
    const meters = Number(data.routes[0].distance);
    if (!Number.isFinite(meters) || meters <= 0) return null;
    const km = meters / 1000;
    await geoWriteCache(pool, cacheKey, "routing", { km }, 48);
    return km;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
