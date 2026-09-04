/**
 * Admin API: счета из кэша (дашборды CMS).
 */

import { adminAuthHeaders } from "./auth";

export async function fetchAdminInvoices(
  adminToken: string,
  dateRange: { dateFrom: string; dateTo: string },
): Promise<unknown[]> {
  const res = await fetch("/api/invoices", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      adminToken,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string })?.error === "string"
        ? (data as { error: string }).error
        : "Ошибка загрузки счетов";
    throw new Error(msg);
  }
  if (Array.isArray(data)) return data;
  const rawItems = (data as { items?: unknown[] })?.items;
  return Array.isArray(rawItems) ? rawItems : [];
}
