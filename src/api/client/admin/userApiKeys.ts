/**
 * Admin API: журнал персональных Partner API ключей.
 */

import { adminAuthHeaders } from "./auth";

export type AdminUserApiKeyCompany = {
  inn: string;
  name: string;
};

export type AdminUserApiKeyRow = {
  id: string;
  user_login: string;
  user_full_name: string | null;
  user_company_name: string | null;
  companies: AdminUserApiKeyCompany[];
  companies_label: string;
  label: string;
  key_prefix: string;
  key_hint: string;
  scopes: string[];
  allowed_inns: string[];
  created_at: string;
  revoked_at: string | null;
  disabled_at: string | null;
  last_used_at: string | null;
  enabled: boolean;
  status: "active" | "disabled" | "revoked";
};

export type AdminUserApiKeysSummary = {
  active: number;
  disabled: number;
  revoked: number;
  used_last_7_days: number;
  never_used: number;
};

export type AdminUserApiKeysReport = {
  keys: AdminUserApiKeyRow[];
  summary: AdminUserApiKeysSummary;
  error?: string;
};

export async function fetchAdminUserApiKeys(
  adminToken: string,
  opts?: { q?: string; status?: "all" | "active" | "disabled" | "revoked"; limit?: number },
): Promise<AdminUserApiKeysReport> {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(`/api/admin-user-api-keys${qs ? `?${qs}` : ""}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as AdminUserApiKeysReport;
  if (!res.ok) {
    throw new Error(data.error || "Не удалось загрузить журнал API-ключей");
  }
  return {
    keys: Array.isArray(data.keys) ? data.keys : [],
    summary: data.summary ?? { active: 0, disabled: 0, revoked: 0, used_last_7_days: 0, never_used: 0 },
  };
}
