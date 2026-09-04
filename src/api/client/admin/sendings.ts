/**
 * Admin API: отправки из кэша (дашборды CMS).
 */

import { adminAuthHeaders } from "./auth";
import type { SendingItem } from "../../../lib/adminSendingsAnalytics";

export async function fetchAdminSendings(
  adminToken: string,
  dateRange: { dateFrom: string; dateTo: string },
): Promise<SendingItem[]> {
  const res = await fetch("/api/sendings", {
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
        : "Ошибка загрузки отправок";
    throw new Error(msg);
  }
  if (Array.isArray(data)) return data as SendingItem[];
  const rawItems = (data as { items?: SendingItem[] })?.items;
  return Array.isArray(rawItems) ? rawItems : [];
}
