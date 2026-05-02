import type { Pool } from "pg";

export async function insertUserAppEvent(
  pool: Pool,
  row: { userId: number | null; login: string; eventType: string; meta?: Record<string, unknown> | null }
): Promise<void> {
  const loginNorm = String(row.login || "").trim().toLowerCase();
  if (!loginNorm || !row.eventType) return;
  try {
    await pool.query(
      `INSERT INTO user_app_events (user_id, login, event_type, meta)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [row.userId, loginNorm, row.eventType, row.meta ? JSON.stringify(row.meta) : null]
    );
  } catch (e) {
    console.error("user_app_events insert error:", e);
  }
}
