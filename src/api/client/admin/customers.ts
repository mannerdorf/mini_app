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

export type AdminCustomersCacheRefreshResult = {
  customers_count?: number;
  upstream_curl?: string;
  upstream_url?: string;
  error?: string;
};

export async function postAdminRefreshCustomersCache(
  adminToken: string,
  options?: { dryRun?: boolean },
): Promise<{ ok: boolean; status: number; data: AdminCustomersCacheRefreshResult; text: string }> {
  const body = options?.dryRun ? { dryRun: true } : {};
  const res = await fetch("/api/admin-refresh-customers-cache", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let data: AdminCustomersCacheRefreshResult = {};
  if (text) {
    try {
      data = JSON.parse(text) as AdminCustomersCacheRefreshResult;
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}
