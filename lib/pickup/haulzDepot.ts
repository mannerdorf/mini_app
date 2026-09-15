import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { warehouseForCity } from "../haulzCalculator/warehouses.js";
import type { City } from "./model.js";

export { isHaulzDepotResource } from "./haulzDepotShared.js";

/** Конечная точка маршрута — фиксированный склад HAULZ (Москва / Калининград). */
export async function ensureHaulzDepot(db: PoolClient, city: City): Promise<string> {
  const wh = warehouseForCity(city);
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM pickup_resources
     WHERE kind = 'depot' AND city = $1 AND data->>'code' = $2
     LIMIT 1`,
    [city, wh.code],
  );
  if (rows[0]?.id) return rows[0].id;

  const id = randomUUID();
  await db.query(
    `INSERT INTO pickup_resources (id, kind, city, name, active, data)
     VALUES ($1, 'depot', $2, $3, true, $4::jsonb)`,
    [
      id,
      city,
      wh.label,
      JSON.stringify({
        code: wh.code,
        haulz: "true",
        address: wh.fullAddress,
        phone: wh.phone,
        from: "09:00",
        to: "18:00",
        note: wh.hours,
        directionsUrl: "",
      }),
    ],
  );
  return id;
}
