import type { Pool } from "pg";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import { normalizeOrderInn } from "./orderCustomerScope.js";

/** Call only after password/API-key verification. Client scope can narrow access, never grant it. */
export async function resolveOrdersAccessInns(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  requestedInn: unknown,
  serviceMode: unknown,
): Promise<Set<string> | null> {
  const loginKey = login.trim().toLowerCase();
  if (serviceMode === true) {
    const { rows } = await pool.query<{ permissions: Record<string, unknown> | null }>(
      "SELECT permissions FROM registered_users WHERE login = $1 AND active = true",
      [loginKey],
    );
    if (rows[0]?.permissions?.service_mode === true) return null;
  }
  const requested = normalizeOrderInn(requestedInn);
  if (verified.accessAllInns) return requested ? new Set([requested]) : null;
  const { rows } = await pool.query<{ inn: string }>(
    "SELECT inn FROM account_companies WHERE login = $1", [loginKey],
  );
  const allowed = new Set(rows.map(row => normalizeOrderInn(row.inn)).filter(Boolean));
  const primary = normalizeOrderInn(verified.inn);
  if (primary) allowed.add(primary);
  // Empty rights must remain empty, never become unrestricted access (null).
  return requested ? new Set(allowed.has(requested) ? [requested] : []) : allowed;
}
