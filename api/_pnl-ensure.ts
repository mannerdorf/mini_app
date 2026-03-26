import type { Pool } from "pg";

let ensured = false;
let ensuring: Promise<void> | null = null;

/**
 * Backward-compat for legacy DB schema where transport_type is missing.
 * Safe to call on every request: runs once per lambda instance.
 */
export async function ensurePnlTransportColumns(pool: Pool): Promise<void> {
  if (ensured) return;
  if (ensuring) return ensuring;
  ensuring = (async () => {
    // Add only columns at runtime. Indexes should be created by migrations to avoid
    // race conditions across concurrent serverless invocations.
    await pool.query("ALTER TABLE pnl_operations ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_operations ADD COLUMN IF NOT EXISTS source_request_uid text");
    await pool.query("ALTER TABLE pnl_sales ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_manual_revenues ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_manual_expenses ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_income_categories ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_classification_rules ADD COLUMN IF NOT EXISTS transport_type text");
    ensured = true;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}
