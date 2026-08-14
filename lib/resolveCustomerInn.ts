import type { Pool } from "pg";
import { normalizeCompanyName, normalizeOrderInn } from "./orderCustomerScope.js";

export type ResolvedCustomer = {
  inn: string;
  name: string;
};

/** ИНН заказчика по наименованию из account_companies или cache_customers. */
export async function lookupCustomerInnByName(
  pool: Pool,
  login: string,
  customerName: string,
): Promise<ResolvedCustomer | null> {
  const nameNorm = normalizeCompanyName(customerName);
  if (!nameNorm) return null;
  const loginKey = String(login ?? "").trim().toLowerCase();
  if (!loginKey) return null;

  try {
    const ac = await pool.query<{ inn: string; name: string }>(
      `SELECT inn, name FROM account_companies WHERE login = $1`,
      [loginKey],
    );
    for (const row of ac.rows) {
      const inn = normalizeOrderInn(row.inn);
      if (!inn) continue;
      if (normalizeCompanyName(row.name) === nameNorm) {
        return { inn, name: String(row.name || customerName).trim() || customerName };
      }
    }

    const cc = await pool.query<{ inn: string; customer_name: string }>(
      `SELECT inn, customer_name FROM cache_customers
       WHERE lower(trim(customer_name)) = lower(trim($1))
       LIMIT 1`,
      [String(customerName).trim()],
    );
    const hit = cc.rows[0];
    const inn = normalizeOrderInn(hit?.inn);
    if (inn) {
      return { inn, name: String(hit.customer_name || customerName).trim() || customerName };
    }
  } catch {
    return null;
  }

  return null;
}
