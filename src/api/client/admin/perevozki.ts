/**
 * Admin API: перевозки из кэша (дашборд «Выдача грузов»).
 */

import type { CargoItem } from "../../../types";
import { adminAuthHeaders } from "./auth";

export async function fetchAdminPerevozki(
  adminToken: string,
  dateRange: { dateFrom: string; dateTo: string }
): Promise<CargoItem[]> {
  const res = await fetch("/api/perevozki", {
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
        : "Ошибка загрузки перевозок";
    throw new Error(msg);
  }
  if (Array.isArray(data)) return data as CargoItem[];
  const rawItems = (data as { items?: CargoItem[] })?.items;
  return Array.isArray(rawItems) ? rawItems : [];
}
