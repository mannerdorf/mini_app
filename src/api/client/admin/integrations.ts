/**
 * Admin API: действия на вкладке интеграций (SendLK, Zvonobot sandbox).
 */

import { adminAuthHeaders } from "./auth";

export type AdminSendlkSyncResult = {
  selected: number;
  sent: number;
  failed: number;
};

export async function postAdminSendlkSync(
  adminToken: string,
  limit = 500
): Promise<AdminSendlkSyncResult> {
  const res = await fetch("/api/admin-sendlk-sync", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ limit }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "Ошибка выгрузки SendLK");
  return {
    selected: Number((data as AdminSendlkSyncResult)?.selected || 0),
    sent: Number((data as AdminSendlkSyncResult)?.sent || 0),
    failed: Number((data as AdminSendlkSyncResult)?.failed || 0),
  };
}

export async function fetchAdminZvonobotConfig(
  adminToken: string
): Promise<{ configured: boolean; keyHint: string }> {
  const res = await fetch("/api/admin-zvonobot-sandbox", {
    method: "GET",
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { configured?: boolean; keyHint?: string };
  return {
    configured: Boolean(data?.configured),
    keyHint: String(data?.keyHint || ""),
  };
}

export async function postAdminZvonobotSandbox(
  adminToken: string,
  action: "create" | "get" | "userInfo" | "getPhones" | "getAvailableLanguages",
  payload: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch("/api/admin-zvonobot-sandbox", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details =
      (data as { error?: string })?.error ||
      (data as { message?: string })?.message ||
      (data as { data?: { error?: string; message?: string } })?.data?.error ||
      (data as { data?: { error?: string; message?: string } })?.data?.message ||
      `HTTP ${res.status}`;
    throw new Error(String(details));
  }
  return data;
}
