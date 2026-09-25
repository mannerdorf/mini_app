import type { Pool } from "pg";
import type { Job, JobData } from "./model.js";
import { getPvzCoordsByRefs, resolvePickupPointCoords, savePvzConfirmedCoords } from "./pvzCoords.js";

export type BackfillJobCoordsResult = {
  scanned: number;
  updated: number;
  pvzRegistryWrites: number;
  skipped: number;
  failures: { jobId: string; jobNumber: string; error: string }[];
};

function needsCoords(data: JobData): boolean {
  const lat = data.latitude;
  const lon = data.longitude;
  return !(lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon));
}

export async function backfillPickupJobCoordinates(
  pool: Pool,
  fromDate: string,
  options: { city?: string; actor?: string; toDate?: string } = {},
): Promise<BackfillJobCoordsResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    throw new Error("fromDate: YYYY-MM-DD");
  }
  const toDate = options.toDate && /^\d{4}-\d{2}-\d{2}$/.test(options.toDate) ? options.toDate : null;
  const city = options.city && ["moscow", "kaliningrad"].includes(options.city) ? options.city : null;
  const actor = String(options.actor ?? "system").trim() || "system";

  const params: unknown[] = [fromDate];
  let where = `date >= $1::date`;
  if (toDate) {
    params.push(toDate);
    where += ` and date <= $${params.length}::date`;
  }
  if (city) {
    params.push(city);
    where += ` and city = $${params.length}`;
  }

  const { rows } = await pool.query<Job>(
    `select id, job_number, city, date, data, status from pickup_jobs where ${where} order by date, job_number`,
    params,
  );

  const result: BackfillJobCoordsResult = {
    scanned: rows.length,
    updated: 0,
    pvzRegistryWrites: 0,
    skipped: 0,
    failures: [],
  };

  for (const row of rows) {
    const data = row.data as JobData;
    if (!needsCoords(data)) {
      result.skipped++;
      continue;
    }
    try {
      const resolved = await resolvePickupPointCoords(pool, row.city, data);
      if (!resolved) {
        result.failures.push({
          jobId: row.id,
          jobNumber: String(row.job_number ?? ""),
          error: "Не удалось определить координаты (нет ПВЗ/адреса или геокод не нашёл точку)",
        });
        continue;
      }

      const pvzRef = String(data.pvzRef ?? "").trim();
      if (pvzRef && resolved.source === "geocode") {
        const existing = await getPvzCoordsByRefs(pool, [pvzRef]);
        if (!existing.has(pvzRef)) {
          await savePvzConfirmedCoords(pool, {
            pvzRef,
            city: row.city,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            fullAddress: resolved.fullAddress || data.address || "",
            confirmedBy: actor,
          });
          result.pvzRegistryWrites++;
        }
      }

      const nextData: JobData = {
        ...data,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        address: resolved.fullAddress || data.address,
      };

      await pool.query(
        `update pickup_jobs set data = $2::jsonb, version = version + 1, updated_at = now() where id = $1`,
        [row.id, JSON.stringify(nextData)],
      );
      result.updated++;
    } catch (e) {
      result.failures.push({
        jobId: row.id,
        jobNumber: String(row.job_number ?? ""),
        error: (e as Error).message || "Ошибка",
      });
    }
  }

  return result;
}
