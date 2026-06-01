import type { Pool } from "pg";

/** Начало календарных суток по Europe/Moscow (UTC+3 без DST). */
export function moscowDayStartUtc(reference = new Date()): Date {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const moscowMs = reference.getTime() + moscowOffsetMs;
  const dayStartMoscow = Math.floor(moscowMs / 86_400_000) * 86_400_000;
  return new Date(dayStartMoscow - moscowOffsetMs);
}

export async function hasSummaryEmailSentToday(pool: Pool, targetLogin: string): Promise<boolean> {
  const login = String(targetLogin || "").trim().toLowerCase();
  if (!login) return false;
  const since = moscowDayStartUtc();
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT 1 AS n FROM haulz_summary_email_send
       WHERE lower(trim(coalesce(target_login, to_email, ''))) = $1
         AND sent_at >= $2
       LIMIT 1`,
      [login, since.toISOString()],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
