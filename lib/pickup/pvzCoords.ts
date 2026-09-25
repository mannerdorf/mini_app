import type { Pool } from "pg";
import { dgisGeocodeFull } from "../haulzCalculator/dgisClient.js";
import type { CityCode } from "../haulzCalculator/types.js";
import type { Job, JobData } from "./model.js";

export type PvzConfirmedCoords = {
  pvzRef: string;
  city: CityCode;
  latitude: number;
  longitude: number;
  fullAddress: string;
};

export type ResolvedPickupPoint = {
  latitude: number;
  longitude: number;
  fullAddress?: string;
  source: "job" | "pvz_registry" | "geocode";
};

function cityCode(raw: string): CityCode {
  return raw === "kaliningrad" ? "kaliningrad" : "moscow";
}

function geocodeQueryFromPvzRow(row: {
  naimenovanie?: string;
  gorod?: string;
  region?: string;
}): string {
  return [row.naimenovanie, row.gorod, row.region].filter(Boolean).join(", ");
}

export async function getPvzCoordsByRefs(
  pool: Pool,
  refs: string[],
): Promise<Map<string, PvzConfirmedCoords>> {
  const keys = [...new Set(refs.map((r) => String(r ?? "").trim()).filter(Boolean))];
  const out = new Map<string, PvzConfirmedCoords>();
  if (keys.length === 0) return out;
  try {
    const { rows } = await pool.query<{
      pvz_ref: string;
      city: string;
      latitude: string;
      longitude: string;
      full_address: string;
    }>(
      `select pvz_ref, city, latitude, longitude, full_address
       from pickup_pvz_coords where pvz_ref = any($1::text[])`,
      [keys],
    );
    for (const row of rows) {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.set(row.pvz_ref, {
        pvzRef: row.pvz_ref,
        city: cityCode(row.city),
        latitude: lat,
        longitude: lon,
        fullAddress: row.full_address || "",
      });
    }
  } catch {
    /* table may be missing before migration */
  }
  return out;
}

export async function savePvzConfirmedCoords(
  pool: Pool,
  input: PvzConfirmedCoords & { confirmedBy: string },
): Promise<void> {
  const ref = String(input.pvzRef ?? "").trim();
  if (!ref) throw new Error("pvzRef обязателен");
  const lat = Number(input.latitude);
  const lon = Number(input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Некорректные координаты");
  }
  await pool.query(
    `insert into pickup_pvz_coords (pvz_ref, city, latitude, longitude, full_address, confirmed_by, confirmed_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (pvz_ref) do update set
       city = excluded.city,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       full_address = excluded.full_address,
       confirmed_by = excluded.confirmed_by,
       confirmed_at = now()`,
    [
      ref,
      input.city,
      lat,
      lon,
      String(input.fullAddress ?? "").trim(),
      String(input.confirmedBy ?? "").trim(),
    ],
  );
}

export async function resolvePickupPointCoords(
  pool: Pool,
  city: CityCode,
  data: Pick<
    JobData,
    "latitude" | "longitude" | "address" | "pvzRef" | "addressKind"
  >,
): Promise<ResolvedPickupPoint | null> {
  const lat = data.latitude;
  const lon = data.longitude;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon, fullAddress: data.address || undefined, source: "job" };
  }

  const pvzRef = String(data.pvzRef ?? "").trim();
  if (pvzRef) {
    const cached = await getPvzCoordsByRefs(pool, [pvzRef]);
    const hit = cached.get(pvzRef);
    if (hit) {
      return {
        latitude: hit.latitude,
        longitude: hit.longitude,
        fullAddress: hit.fullAddress || data.address || undefined,
        source: "pvz_registry",
      };
    }
    try {
      const { rows } = await pool.query<{
        naimenovanie: string;
        gorod: string;
        region: string;
      }>(`select naimenovanie, gorod, region from cache_pvz where ssylka = $1 limit 1`, [pvzRef]);
      if (rows[0]) {
        const q = geocodeQueryFromPvzRow(rows[0]);
        if (q) {
          const fwd = await dgisGeocodeFull(q, pool);
          if (fwd?.point) {
            return {
              latitude: fwd.point.lat,
              longitude: fwd.point.lon,
              fullAddress: fwd.fullAddress || data.address || q,
              source: "geocode",
            };
          }
        }
      }
    } catch {
      /* geocode optional */
    }
  }

  const address = String(data.address ?? "").trim();
  if (address) {
    const cityLabel = city === "kaliningrad" ? "Калининград" : "Москва";
    const queries = [
      address,
      address.toLowerCase().includes(cityLabel.toLowerCase()) ? "" : `${cityLabel}, ${address}`,
    ].filter(Boolean);
    for (const q of queries) {
      try {
        const fwd = await dgisGeocodeFull(q, pool);
        if (fwd?.point) {
          return {
            latitude: fwd.point.lat,
            longitude: fwd.point.lon,
            fullAddress: fwd.fullAddress || address,
            source: "geocode",
          };
        }
      } catch {
        /* try next query */
      }
    }
  }

  return null;
}

/** Записать найденные координаты в забор (и в реестр ПВЗ при geocode + pvzRef). */
export async function persistResolvedPickupCoords(
  pool: Pool,
  job: Pick<Job, "id" | "city" | "data">,
  resolved: ResolvedPickupPoint,
  actor: string,
): Promise<JobData> {
  const next: JobData = {
    ...job.data,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  };
  if (resolved.fullAddress?.trim()) {
    next.address = resolved.fullAddress.trim();
  }
  await pool.query(
    `update pickup_jobs set data = $2::jsonb, version = version + 1, updated_at = now() where id = $1`,
    [job.id, JSON.stringify(next)],
  );
  const pvzRef = String(job.data.pvzRef ?? "").trim();
  if (pvzRef && resolved.source === "geocode") {
    await savePvzConfirmedCoords(pool, {
      pvzRef,
      city: job.city,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      fullAddress: resolved.fullAddress || next.address || "",
      confirmedBy: actor,
    });
  }
  return next;
}

export async function resolvePickupBillingCoords(
  pool: Pool,
  job: Pick<Job, "city" | "data">,
): Promise<{ latitude: number; longitude: number } | null> {
  const resolved = await resolvePickupPointCoords(pool, job.city, job.data);
  if (!resolved) return null;
  return { latitude: resolved.latitude, longitude: resolved.longitude };
}
