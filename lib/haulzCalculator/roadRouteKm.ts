import type { Pool } from "pg";
import type { GeoPoint } from "./types.js";
import { dgisReadCache, dgisRouteKmOrNull, dgisWriteCache } from "./dgisClient.js";

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/** Максимум из доступных маршрутов (для расчёта берём большее). */
export function roadKmForCalc(osrmKm: number | null, dgisKm: number | null): number | null {
  const vals = [osrmKm, dgisKm].filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

export type RoadRouteBreakdown = {
  osrmKm: number | null;
  dgisKm: number | null;
  km: number | null;
};

/** Параллельно OSRM и 2GIS Routing. */
export async function roadRouteKmBoth(
  from: GeoPoint,
  to: GeoPoint,
  pool: Pool | null = null,
): Promise<RoadRouteBreakdown> {
  const [osrmKm, dgisKm] = await Promise.all([
    roadRouteKm(from, to, pool),
    dgisRouteKmOrNull(from, to, pool),
  ]);
  return { osrmKm, dgisKm, km: roadKmForCalc(osrmKm, dgisKm) };
}

/**
 * Дорожное расстояние OSRM, км; при ошибке — null.
 */
export async function roadRouteKm(
  from: GeoPoint,
  to: GeoPoint,
  pool: Pool | null = null,
): Promise<number | null> {
  const cacheKey = `osrm:${from.lat.toFixed(5)},${from.lon.toFixed(5)}:${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  const cached = await dgisReadCache(pool, cacheKey);
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
    await dgisWriteCache(pool, cacheKey, "routing", { km }, 48);
    return km;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
