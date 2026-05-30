/**
 * Admin API: отчёт активности пользователей.
 */

import { adminAuthHeaders } from "./auth";

export type AdminUserActivitySummary = {
  distinct_users: number;
  total_logins: number;
  total_ui_opens: number;
  expense_requests_created: number;
  claims_created: number;
  pending_orders_created: number;
};

export type AdminUserActivityUserRow = {
  login: string;
  company_name: string | null;
  full_name: string | null;
  logins: number;
  ui_hits: number;
  ui_sections: Record<string, number>;
  expense_requests: number;
  claims: number;
  pending_orders: number;
  last_event_at: string | null;
};

export type AdminUserActivityEventRow = {
  login: string;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type AdminUserActivityReport = {
  period?: { from: string; to: string };
  summary?: AdminUserActivitySummary;
  by_user?: AdminUserActivityUserRow[];
  recent_events?: AdminUserActivityEventRow[];
  error?: string;
};

export async function fetchAdminUserActivityReport(
  adminToken: string,
  period: { from: string; to: string }
): Promise<AdminUserActivityReport> {
  const params = new URLSearchParams({ from: period.from, to: period.to });
  const res = await fetch(`/api/admin-user-activity-report?${params}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const json = (await res.json().catch(() => ({}))) as AdminUserActivityReport;
  if (!res.ok) {
    throw new Error(json.error || `Ошибка ${res.status}`);
  }
  return json;
}
