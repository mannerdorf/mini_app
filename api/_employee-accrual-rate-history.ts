import type { Pool } from "pg";

export async function ensureEmployeeAccrualRateHistoryTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_accrual_rate_history (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      effective_from date NOT NULL,
      accrual_rate numeric(12, 2) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, effective_from)
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS employee_accrual_rate_history_emp_from_idx ON employee_accrual_rate_history(employee_id, effective_from DESC)"
  );
}

export function todayDateMoscow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseIsoDateOnly(value: unknown): string | null {
  const s = String(Array.isArray(value) ? value[0] : value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return s;
}

export async function getAccrualRateAtDate(
  pool: Pool,
  employeeId: number,
  workDate: string,
  fallbackRate: number | null
): Promise<number> {
  const { rows } = await pool.query<{ accrual_rate: string | null }>(
    `SELECT accrual_rate::text
     FROM employee_accrual_rate_history
     WHERE employee_id = $1 AND effective_from <= $2::date
     ORDER BY effective_from DESC
     LIMIT 1`,
    [employeeId, workDate]
  );
  if (rows[0]?.accrual_rate != null) return Number(rows[0].accrual_rate);
  return Number(fallbackRate ?? 0);
}

/** Resolved numeric rate per calendar date (YYYY-MM-DD). */
export async function getAccrualRatesForDates(
  pool: Pool,
  employeeId: number,
  dates: string[],
  fallbackRate: number | null
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (dates.length === 0) return map;
  const fb = fallbackRate == null || !Number.isFinite(Number(fallbackRate)) ? 0 : Number(fallbackRate);
  const { rows } = await pool.query<{ work_date: string; accrual_rate: string | null }>(
    `SELECT d::text AS work_date,
            COALESCE(
              (SELECT h.accrual_rate
               FROM employee_accrual_rate_history h
               WHERE h.employee_id = $1 AND h.effective_from <= d
               ORDER BY h.effective_from DESC
               LIMIT 1),
              $3::numeric
            )::text AS accrual_rate
     FROM unnest($2::date[]) AS d`,
    [employeeId, dates, fb]
  );
  for (const r of rows) {
    const key = String(r.work_date || "").slice(0, 10);
    map.set(key, Number(r.accrual_rate || 0));
  }
  return map;
}

export async function syncRegisteredUserAccrualRateFromHistory(
  pool: Pool,
  employeeId: number,
  legacyFallback: number | null
): Promise<void> {
  const day = todayDateMoscow();
  const next = await getAccrualRateAtDate(pool, employeeId, day, legacyFallback);
  await pool.query(`UPDATE registered_users SET accrual_rate = $1 WHERE id = $2`, [
    Number(next.toFixed(2)),
    employeeId,
  ]);
}
