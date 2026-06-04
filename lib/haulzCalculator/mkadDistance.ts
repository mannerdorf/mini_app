import type { Pool } from "pg";
import type { CityCode, GeoPoint, RingExitRow } from "./types.js";
import { roadRouteKm } from "./roadRouteKm.js";

const EARTH_RADIUS_KM = 6371;
/** Как «МаксимальноеКоличествоКандидатовСъездов» в 1С. */
export const MAX_EXIT_CANDIDATES = 7;

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

/** Ray-casting (как «ТочкаВнутриПолигона» в 1С). */
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

/**
 * Обход по контуру (как «ПроверитьТочкуНаВхождение» в 1С).
 * В 1С в полигоне Х = широта, У = долгота.
 */
export function pointInsideByWinding(point: GeoPoint, ring: GeoPoint[]): boolean {
  if (ring.length < 3) return false;

  const template = [
    [0, 1],
    [3, 2],
  ];

  let result = 0;
  const size = ring.length - 1;
  let prev = ring[size];
  let prevX = prev.lat - point.lat;
  let prevY = prev.lon - point.lon;
  let hx = prevY < 0 ? 1 : 0;
  let hy = prevX < 0 ? 1 : 0;
  let prevKu = template[hx][hy];

  for (let i = 0; i <= size; i++) {
    const cur = ring[i];
    const curX = cur.lat - point.lat;
    const curY = cur.lon - point.lon;
    hx = curY < 0 ? 1 : 0;
    hy = curX < 0 ? 1 : 0;
    const ku = template[hx][hy];
    const delta = ku - prevKu;

    if (delta === -3) result += 1;
    else if (delta === 3) result -= 1;
    else if (delta === -2) {
      if (prevX * curY >= prevY * curX) result += 1;
    } else if (delta === 2) {
      if (!(prevX * curY >= prevY * curX)) result -= 1;
    }

    prevX = curX;
    prevY = curY;
    prevKu = ku;
  }

  return result !== 0;
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

/** Полигон по углу вокруг центра (для seed / отображения). */
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

/** Полигон в порядке справочника съездов (как «Мполигона» в 1С). */
export function polygonFromExitsCatalogOrder(exits: RingExitRow[]): GeoPoint[] {
  return exits.map((e) => ({ lat: e.lat, lon: e.lon }));
}

/** Внутри кольца: оба теста 1С или сохранённый полигон из БД. */
export function isInsideRingPolygon(point: GeoPoint, catalogRing: GeoPoint[], storedRing: GeoPoint[]): boolean {
  if (catalogRing.length >= 3) {
    if (pointInsideByWinding(point, catalogRing) || pointInPolygon(point, catalogRing)) {
      return true;
    }
  }
  if (storedRing.length >= 3 && pointInPolygon(point, storedRing)) {
    return true;
  }
  return false;
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

/** Топ-N съездов по прямой (шаг 1 алгоритма 1С). */
export function pickTopExitsByHaversine(
  address: GeoPoint,
  exits: RingExitRow[],
  topN = MAX_EXIT_CANDIDATES,
): RingExitRow[] {
  return [...exits]
    .map((e) => ({ e, d: haversineKm(address, { lat: e.lat, lon: e.lon }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, topN)
    .map((x) => x.e);
}

type ExitCandidate = RingExitRow & {
  straightKm: number;
  roadKm: number;
  routed: boolean;
};

/**
 * Км за пределами МКАД/КАД — порт логики из «расчет расстояний.txt» (1С):
 * 1) полигон из съездов → внутри = 0;
 * 2) прямая до каждого съезда, сортировка;
 * 3) для топ-7 — дорожное расстояние (OSRM вместо 2GIS);
 * 4) минимум по дороге среди успешно рассчитанных.
 */
export async function kmBeyondRing(
  pool: Pool,
  cityCode: CityCode,
  address: GeoPoint,
  kmOverride?: number,
): Promise<number> {
  if (kmOverride != null && Number.isFinite(kmOverride) && kmOverride >= 0) {
    return kmOverride;
  }

  const exits = await loadActiveExits(pool, cityCode);
  if (exits.length === 0) return 0;

  const catalogRing = polygonFromExitsCatalogOrder(exits);
  const storedRing = await loadRingPolygon(pool, cityCode);
  if (isInsideRingPolygon(address, catalogRing, storedRing)) {
    return 0;
  }

  const candidates: ExitCandidate[] = exits.map((e) => {
    const straightM = Math.round(haversineKm({ lat: e.lat, lon: e.lon }, address) * 1000);
    return {
      ...e,
      straightKm: straightM / 1000,
      roadKm: 0,
      routed: false,
    };
  });

  candidates.sort((a, b) => a.straightKm - b.straightKm);

  const top = candidates.slice(0, MAX_EXIT_CANDIDATES);
  const addressPoint = address;

  await Promise.all(
    top.map(async (c) => {
      const exitPoint = { lat: c.lat, lon: c.lon };
      const km = await roadRouteKm(exitPoint, addressPoint, pool);
      if (km != null && Number.isFinite(km)) {
        c.roadKm = km;
        c.routed = true;
      }
    }),
  );

  candidates.sort((a, b) => a.roadKm - b.roadKm);

  for (const c of candidates) {
    if (c.routed) {
      return Math.max(0, c.roadKm);
    }
  }

  return 0;
}
