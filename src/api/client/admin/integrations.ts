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
    backfillStatus?: "done" | "current" | "pending" | "before_range";
  }>;
  cacheEarliestDate?: string;
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

export async function fetchPartnerApiHealth(): Promise<unknown> {
  const res = await fetch("/api/partner/v1/health");
  return res.json().catch(() => ({ error: "Не удалось загрузить /api/partner/v1/health" }));
}

export type AdminYandexTranslateConfig = {
  yandexConfigured: boolean;
  yandexKeyHint: string;
  folderIdConfigured: boolean;
  folderIdHint: string;
  openaiConfigured: boolean;
  openaiKeyHint: string;
  preferredProvider: "yandex" | null;
};

export async function fetchAdminYandexTranslateConfig(
  adminToken: string,
): Promise<AdminYandexTranslateConfig> {
  const res = await fetch("/api/admin-yandex-translate-sandbox", {
    method: "GET",
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminYandexTranslateConfig>;
  return {
    yandexConfigured: Boolean(data?.yandexConfigured),
    yandexKeyHint: String(data?.yandexKeyHint || ""),
    folderIdConfigured: Boolean(data?.folderIdConfigured),
    folderIdHint: String(data?.folderIdHint || ""),
    openaiConfigured: Boolean(data?.openaiConfigured),
    openaiKeyHint: String(data?.openaiKeyHint || ""),
    preferredProvider: data?.preferredProvider === "yandex" ? "yandex" : null,
  };
}

export async function postAdminYandexTranslateSandbox(
  adminToken: string,
  mode: "direct" | "productNames" | "fivepost",
  texts: string[],
): Promise<unknown> {
  const res = await fetch("/api/admin-yandex-translate-sandbox", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ mode, texts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((data as { error?: string })?.error || `HTTP ${res.status}`));
  }
  return data;
}

export type AdminConnectivitySandboxReport = {
  ok: boolean;
  runtime: {
    nodeVersion: string;
    platform: string;
    vercelRegion: string | null;
    vercelEnv: string | null;
  };
  env: {
    databaseUrlConfigured: boolean;
    databaseHost: string;
    pgSslMode: string;
    cronSecretConfigured: boolean;
    perevozkiConfigured: boolean;
  };
  database: {
    ok: boolean;
    latencyMs?: number;
    error?: string;
    errorCode?: string;
    hint?: string;
  };
  samples: {
    accountCompanies: number | null;
    registeredUsers: number | null;
    cachePerevozkiRows: number | null;
    cachePerevozkiFetchedAt: string | null;
    adminAuthConfigReadable: boolean;
  };
  request_id?: string;
};

export async function fetchAdminConnectivitySandbox(
  adminToken: string,
): Promise<AdminConnectivitySandboxReport> {
  const res = await fetch("/api/admin-connectivity-sandbox", {
    method: "GET",
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((data as { error?: string })?.error || `HTTP ${res.status}`));
  }
  return data as AdminConnectivitySandboxReport;
}
