import type { Pool } from "pg";
import { perevozkiCustomerInn } from "../perevozkiPartyMatch.js";

const text = (value: unknown) => String(value ?? "").trim();
const numberKey = (value: unknown) => {
  const valueText = text(value);
  return /^\d+$/.test(valueText) ? valueText.replace(/^0+/, "") || "0" : valueText;
};
type PhotoJob = { job_number: string; data: Record<string, unknown> };

export function cargoHasPickupPhotos(cargo: Record<string, unknown>, jobs: PhotoJob[]): boolean {
  const inn = perevozkiCustomerInn(cargo);
  if (!inn) return false;
  const pickup = text(cargo.НомерПикапа ?? cargo.PickupNumber);
  const order = numberKey(cargo.ZayavkaNumber);
  const number = numberKey(cargo.rawNumber ?? cargo.Number ?? cargo.НомерПеревозки);
  return jobs.some((job) => {
    if (job.data.serviceKind === "last_mile") return false;
    if (text(job.data.customerInn) !== inn) return false;
    const jobOrder = numberKey(job.data.zayavkaNumber);
    const jobCargo = numberKey(job.data.cargoNumber);
    // Conflicting explicit links must not expose another pickup's indicator.
    if (pickup && pickup !== text(job.job_number)) return false;
    if (order && jobOrder && order !== jobOrder) return false;
    if (number && jobCargo && number !== jobCargo) return false;
    return Boolean((pickup && pickup === text(job.job_number)) ||
      (order && order === jobOrder) || (number && number === jobCargo));
  });
}

/** Called only after cargo authorization/filtering. No image bytes or pickup IDs leave the API. */
export async function annotateCargoPickupPhotos(pool: Pool, items: any[]): Promise<any[]> {
  const clean = items.map((item) => ({ ...item, pickupHasDriverPhotos: false }));
  const inns = [...new Set(items.map(perevozkiCustomerInn).filter(Boolean))];
  if (!inns.length) return clean;
  try {
    const { rows } = await pool.query<PhotoJob>(`
      SELECT j.job_number, j.data FROM pickup_jobs j
      WHERE btrim(j.data->>'customerInn') = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM pickup_photos p WHERE p.job_id = j.id)
    `, [inns]);
    return clean.map((item) => ({ ...item, pickupHasDriverPhotos: cargoHasPickupPhotos(item, rows) }));
  } catch {
    // An unavailable pickup module must not make the cargo list unavailable.
    console.warn("pickup_photo_indicator_unavailable");
    return clean;
  }
}
