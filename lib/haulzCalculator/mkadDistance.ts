import type { Pool } from "pg";
import type { CityCode, GeoPoint, RingExitRow } from "./types.js";
import { dgisRouteKm } from "./dgisClient.js";

const EARTH_RADIUS_KM = 6371;
const TOP_EXIT_CANDIDATES = 7;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-casting point-in-polygon (ring may be open; first==last not required). */
export function pointInPolygon(point: GeoPoint, ring: GeoPoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(ring: GeoPoint[]): GeoPoint {
  if (ring.length === 0) return { lat: 55.75, lon: 37.62 };
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

/** Order exits by polar angle around centroid → closed ring for inside test. */
export function ringFromExits(exits: RingExitRow[]): GeoPoint[] {
  if (exits.length < 3) return [];
  const pts = exits.map((e) => ({ lat: e.lat, lon: e.lon }));
  const c = polygonCentroid(pts);
  return [...pts].sort((a, b) => {
    const aa = Math.atan2(a.lat - c.lat, a.lon - c.lon);
    const bb = Math.atan2(b.lat - c.lat, b.lon - c.lon);
    return aa - bb;
  });
}

export async function loadRingPolygon(pool: Pool, cityCode: CityCode): Promise<GeoPoint[]> {
  const { rows } = await pool.query<{ lat: string; lon: string }>(
    `select lat::float8 as lat, lon::float8 as lon
     from haulz_calc_ring_polygon
     where city_code = $1
     order by seq`,
    [cityCode],
  );
  if (rows.length >= 3) {
    return rows.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon) }));
  }
  const { rows: exits } = await pool.query<RingExitRow>(
    `select id, city_code, code, name, lat::float8 as lat, lon::float8 as lon, active, sort_order
     from haulz_calc_ring_exits
     where city_code = $1 and active = true
     order by sort_order, id`,
    [cityCode],
  );
  return ringFromExits(exits);
}

export async function loadActiveExits(pool: Pool, cityCode: CityCode): Promise<RingExitRow[]> {
  const { rows } = await pool.query<RingExitRow>(
    `select id, city_code, code, name, lat::float8 as lat, lon::float8 as lon, active, sort_order
     from haulz_calc_ring_exits
     where city_code = $1 and active = true
     order by sort_order, id`,
    [cityCode],
  );
  return rows;
}

export function pickTopExitsByHaversine(address: GeoPoint, exits: RingExitRow[], topN = TOP_EXIT_CANDIDATES): RingExitRow[] {
  return [...exits]
    .map((e) => ({ e, d: haversineKm(address, { lat: e.lat, lon: e.lon }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, topN)
    .map((x) => x.e);
}

export async function kmBeyondRing(
  pool: Pool,
  cityCode: CityCode,
  address: GeoPoint,
  kmOverride?: number,
): Promise<number> {
  if (kmOverride != null && Number.isFinite(kmOverride) && kmOverride >= 0) {
    return kmOverride;
  }
  const polygon = await loadRingPolygon(pool, cityCode);
  if (polygon.length >= 3 && pointInPolygon(address, polygon)) {
    return 0;
  }
  const exits = await loadActiveExits(pool, cityCode);
  if (exits.length === 0) return 0;

  const candidates = pickTopExitsByHaversine(address, exits);
  let minKm = Infinity;
  for (const exit of candidates) {
    const exitPoint = { lat: exit.lat, lon: exit.lon };
    try {
      const km = await dgisRouteKm(exitPoint, address, pool);
      if (km < minKm) minKm = km;
    } catch {
      const fallback = haversineKm(exitPoint, address);
      if (fallback < minKm) minKm = fallback;
    }
  }
  return Number.isFinite(minKm) ? Math.max(0, minKm) : 0;
}
