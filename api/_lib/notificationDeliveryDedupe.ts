import type { Pool } from "pg";

/** Уже успешно отправляли это событие этому логину — повторно не шлём. */
export async function wasSuccessfulNotificationDelivery(
  pool: Pool,
  params: {
    login: string;
    inn: string;
    cargoNumber: string;
    event: string;
    channel: string;
  }
): Promise<boolean> {
  const login = String(params.login || "").trim().toLowerCase();
  const inn = String(params.inn || "").trim();
  const cargoNumber = String(params.cargoNumber || "").trim();
  const event = String(params.event || "").trim();
  const channel = String(params.channel || "").trim();
  if (!login || !inn || !cargoNumber || !event || !channel) return false;
  try {
    const result = await pool.query(
      `select 1
       from notification_deliveries
       where lower(trim(login)) = $1
         and inn = $2
         and cargo_number = $3
         and event = $4
         and channel = $5
         and success = true
       limit 1`,
      [login, inn, cargoNumber, event, channel]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    // Dedup is best-effort when table/permissions differ.
    return false;
  }
}
