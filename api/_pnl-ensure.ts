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
    await pool.query("ALTER TABLE pnl_operations ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_sales ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_manual_revenues ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_manual_expenses ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_income_categories ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("ALTER TABLE pnl_classification_rules ADD COLUMN IF NOT EXISTS transport_type text");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_operations_transport_type_idx ON pnl_operations(transport_type)");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_sales_transport_type_idx ON pnl_sales(transport_type)");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_manual_revenues_transport_type_idx ON pnl_manual_revenues(transport_type)");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_manual_expenses_transport_type_idx ON pnl_manual_expenses(transport_type)");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_income_categories_transport_type_idx ON pnl_income_categories(transport_type)");
    await pool.query("CREATE INDEX IF NOT EXISTS pnl_classification_rules_transport_type_idx ON pnl_classification_rules(transport_type)");
    ensured = true;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}
