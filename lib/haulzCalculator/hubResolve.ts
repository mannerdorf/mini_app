import type { Pool } from "pg";
import type { CityCode, GeoPoint } from "./types.js";

export type HubRow = {
  id: number;
  code: string;
  name: string;
  lat: number;
  lon: number;
  role: CityCode;
  active: boolean;
};

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function listActiveHubs(pool: Pool, role?: CityCode): Promise<HubRow[]> {
  const params: unknown[] = [];
  let where = "where active = true";
  if (role) {
    params.push(role);
    where += ` and role = $${params.length}`;
  }
  const { rows } = await pool.query<HubRow>(
    `select id, code, name, lat::float8 as lat, lon::float8 as lon, role, active
     from haulz_calc_hubs ${where} order by name`,
    params,
  );
  return rows;
}

/** Ближайший активный хаб по прямой (как НайтиГородПоАдресу в 1С). */
export async function resolveNearestHub(
  pool: Pool,
  point: GeoPoint,
  role: CityCode,
): Promise<HubRow | null> {
  const hubs = await listActiveHubs(pool, role);
  if (hubs.length === 0) return null;
  let best = hubs[0];
  let bestKm = haversineKm(point, best);
  for (let i = 1; i < hubs.length; i++) {
    const km = haversineKm(point, hubs[i]);
    if (km < bestKm) {
      bestKm = km;
      best = hubs[i];
    }
  }
  return best;
}
