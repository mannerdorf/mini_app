import type { Pool } from "pg";

export type AuditEntry = {
  action: string;
  target_type: string;
  target_id?: string | number | null;
  details?: Record<string, unknown> | null;
};

export async function writeAuditLog(
  pool: Pool,
  entry: AuditEntry
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (action, target_type, target_id, details) VALUES ($1, $2, $3, $4)`,
      [
        entry.action,
        entry.target_type,
        entry.target_id != null ? String(entry.target_id) : null,
        entry.details ? JSON.stringify(entry.details) : null,
      ]
    );
  } catch (e) {
    console.error("admin_audit_log write error:", e);
  }
}
