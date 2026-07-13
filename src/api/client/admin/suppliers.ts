/**
 * Admin API: поиск поставщиков (CMS).
 */

import { adminAuthHeaders } from "./auth";

export type AdminSupplierSearchRow = {
  inn: string;
  supplier_name: string;
  email: string;
};

export async function searchAdminSuppliers(
  adminToken: string,
  opts?: { q?: string; limit?: number }
): Promise<AdminSupplierSearchRow[]> {
  const q = String(opts?.q ?? "").trim();
  const limit = opts?.limit ?? (q.length >= 2 ? 500 : 10000);
  const params = new URLSearchParams({ q: q.length >= 2 ? q : "", limit: String(limit) });
  const res = await fetch(`/api/admin-suppliers-search?${params}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { suppliers?: AdminSupplierSearchRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data.suppliers || [];
}

export async function postAdminRefreshSuppliersCache(
  adminToken: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; text: string }> {
  const res = await fetch("/api/admin-refresh-suppliers-cache", {
    method: "POST",
    headers: adminAuthHeaders(adminToken),
  });
  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}
