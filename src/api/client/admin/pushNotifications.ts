import { adminAuthHeaders } from "./auth";

function formatAdminPushApiError(data: unknown, fallback: string): string {
  const err = (data as { error?: string; path?: string })?.error || fallback;
  if (err === "API route not found") {
    return "Маршрут API не найден — обновите код на API haulzbackend (git pull staging + restart haulz-api)";
  }
  return err;
}

export type AdminPushAudienceType =
  | "all_with_token"
  | "logins"
  | "inns"
  | "cargo_in_transit"
  | "cargo_accepted"
  | "cargo_delivered";

export type AdminPushAudience =
  | { type: "all_with_token" }
  | { type: "logins"; logins: string[] }
  | { type: "inns"; inns: string[] }
  | { type: "cargo_in_transit" }
  | { type: "cargo_accepted" }
  | { type: "cargo_delivered" };

export type AdminPushPreviewResult = {
  ok: boolean;
  audience: AdminPushAudienceType;
  recipientsTotal: number;
  withToken: number;
  withoutToken: number;
  sampleLogins: string[];
  sampleWithoutToken: string[];
  fcmConfigured: boolean;
};

export type AdminPushSendResult = {
  ok: boolean;
  dryRun?: boolean;
  audience: AdminPushAudienceType;
  recipientsTotal: number;
  selected: number;
  sent: number;
  failed: number;
  devicesSent?: number;
  skippedNoToken: number;
  truncated: boolean;
  failures?: Array<{ login: string; error?: string }>;
};

export async function postAdminPushPreview(
  adminToken: string,
  audience: AdminPushAudience,
): Promise<AdminPushPreviewResult> {
  const res = await fetch("/api/admin-push-preview", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ audience }),
  });
  const data = (await res.json().catch(() => ({}))) as AdminPushPreviewResult & { error?: string };
  if (!res.ok) throw new Error(formatAdminPushApiError(data, "Ошибка предпросмотра получателей"));
  return data;
}

export type AdminPushSubscriberCompany = {
  inn: string;
  name: string;
};

export type AdminPushSubscriber = {
  login: string;
  companyName: string;
  deviceCount: number;
  lastSeen: string | null;
  platforms: string[];
  serviceWide: boolean;
  boundFromProfile: boolean;
  pushCompanies: AdminPushSubscriberCompany[];
  accountCompanies: AdminPushSubscriberCompany[];
  enabledEvents: string[];
};

export type AdminPushSubscribersResult = {
  ok: boolean;
  users: number;
  devices: number;
  companies: number;
  subscribers: AdminPushSubscriber[];
};

export async function fetchAdminPushSubscribers(adminToken: string): Promise<AdminPushSubscribersResult> {
  const res = await fetch("/api/admin-push-subscribers", {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as AdminPushSubscribersResult & { error?: string };
  if (!res.ok) throw new Error(formatAdminPushApiError(data, "Ошибка загрузки пользователей с push"));
  return {
    ok: true,
    users: Number(data.users) || 0,
    devices: Number(data.devices) || 0,
    companies: Number(data.companies) || 0,
    subscribers: Array.isArray(data.subscribers)
      ? data.subscribers.map((row) => ({
          ...row,
          enabledEvents: Array.isArray(row.enabledEvents) ? row.enabledEvents : [],
        }))
      : [],
  };
}

export type AdminPushControlJournalEntry = {
  id: string | number;
  login: string;
  inn: string;
  action: string;
  channel: string;
  eventId: string | null;
  enabled: boolean | null;
  deviceTokenSuffix: string | null;
  platform: string | null;
  meta: unknown;
  createdAt: string;
};

export type AdminPushControlJournalResult = {
  ok: boolean;
  count: number;
  entries: AdminPushControlJournalEntry[];
  notice?: string;
};

export async function fetchAdminPushControlJournal(
  adminToken: string,
  params?: { login?: string; inn?: string; action?: string; limit?: number },
): Promise<AdminPushControlJournalResult> {
  const q = new URLSearchParams();
  if (params?.login) q.set("login", params.login);
  if (params?.inn) q.set("inn", params.inn);
  if (params?.action) q.set("action", params.action);
  if (params?.limit) q.set("limit", String(params.limit));
  const res = await fetch(`/api/admin-push-control-journal${q.toString() ? `?${q}` : ""}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as AdminPushControlJournalResult & { error?: string };
  if (!res.ok) throw new Error(formatAdminPushApiError(data, "Ошибка загрузки журнала push"));
  return {
    ok: true,
    count: Number(data.count) || 0,
    entries: Array.isArray(data.entries) ? data.entries : [],
    notice: data.notice,
  };
}

export async function postAdminPushSend(
  adminToken: string,
  payload: {
    audience: AdminPushAudience;
    title: string;
    body: string;
    url?: string;
    dryRun?: boolean;
    limit?: number;
  },
): Promise<AdminPushSendResult> {
  const res = await fetch("/api/admin-push-send", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as AdminPushSendResult & { error?: string };
  if (!res.ok) throw new Error(formatAdminPushApiError(data, "Ошибка отправки push-уведомлений"));
  return data;
}
