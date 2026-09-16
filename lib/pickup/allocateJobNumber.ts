import type { PoolClient } from "pg";

/** Человекочитаемый номер забора (не заявка и не перевозка). */
export function formatPickupJobNumber(seq: number): string {
  return `ZB-${String(seq).padStart(6, "0")}`;
}

export async function allocatePickupJobNumber(db: PoolClient): Promise<string> {
  const { rows } = await db.query<{ job_number: string }>(
    `SELECT 'ZB-' || lpad(nextval('pickup_job_number_seq')::text, 6, '0') AS job_number`,
  );
  const n = rows[0]?.job_number?.trim();
  if (!n) throw new Error("Failed to allocate pickup job_number");
  return n;
}
