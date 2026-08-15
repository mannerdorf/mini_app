import { adminAuthHeaders } from "./auth";

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
  if (!res.ok) throw new Error(data?.error || "Ошибка предпросмотра получателей");
  return data;
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
  if (!res.ok) throw new Error(data?.error || "Ошибка отправки push-уведомлений");
  return data;
}
