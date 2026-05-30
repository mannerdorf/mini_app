/**
 * Admin API: поиск заказчиков (CMS).
 */

import { adminAuthHeaders } from "./auth";

export type AdminCustomerSearchRow = {
  inn: string;
  customer_name: string;
  email?: string;
};

export async function searchAdminCustomers(
  adminToken: string,
  opts?: { q?: string; limit?: number }
): Promise<AdminCustomerSearchRow[]> {
  const q = String(opts?.q ?? "").trim();
  const limit = opts?.limit ?? (q.length >= 2 ? 500 : 2000);
  const params = new URLSearchParams({ q: q.length >= 2 ? q : "", limit: String(limit) });
  const res = await fetch(`/api/admin-customers-search?${params}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { customers?: AdminCustomerSearchRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data.customers || [];
}
