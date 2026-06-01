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

export type DocumentCacheBackfillStatus = {
  historyDays: number;
  stepDaysDefault: number;
  state: {
    rangeStart: string;
    rangeEnd: string;
    nextFrom: string;
    stepDays: number;
    kindCursor?: number;
    nextKind?: string;
    nextKindLabel?: string;
    done: boolean;
    lastStep: unknown;
    updatedAt: string | null;
  };
  coverage: {
    perevozki: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
    sendings: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
    invoices: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
    acts: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
  };
  coverageByMonth?: Array<{
    month: string;
    monthLabel: string;
    perevozki: number;
    sendings: number;
    invoices: number;
    acts: number;
  }>;
};

export async function fetchDocumentCacheBackfillStatus(adminToken: string): Promise<DocumentCacheBackfillStatus> {
  const res = await fetch("/api/admin-document-cache-backfill", {
    method: "GET",
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "Ошибка статуса backfill");
  return data as DocumentCacheBackfillStatus;
}

export async function postDocumentCacheBackfill(
  adminToken: string,
  body: { action: "reset" | "step" | "reset_and_run"; historyDays?: number; stepDays?: number; maxSteps?: number }
): Promise<DocumentCacheBackfillStatus & { steps?: unknown[]; message?: string }> {
  const res = await fetch("/api/admin-document-cache-backfill", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      (data as { error?: string })?.error ||
      (data as { message?: string })?.message ||
      `HTTP ${res.status}`;
    throw new Error(String(err));
  }
  return data as DocumentCacheBackfillStatus & { steps?: unknown[]; message?: string };
}
