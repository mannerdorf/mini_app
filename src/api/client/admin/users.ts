/**
 * Admin API: список пользователей CMS.
 */

import { adminAuthHeaders } from "./auth";

export type AdminUserRow = {
  id: number;
  login: string;
  inn: string;
  company_name: string;
  permissions: Record<string, boolean>;
  financial_access: boolean;
  access_all_inns?: boolean;
  active: boolean;
  created_at: string;
  last_login_at?: string | null;
  companies?: { inn: string; name: string }[];
};

export type AdminUsersResponse = {
  users: AdminUserRow[];
  last_login_available: boolean;
};

export async function fetchAdminUsers(adminToken: string): Promise<AdminUsersResponse> {
  const res = await fetch("/api/admin-users", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminUsersResponse> & { error?: string };
  if (res.status === 401) {
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
  return {
    users: data.users || [],
    last_login_available: data.last_login_available !== false,
  };
}

export type AdminRegisterUserPayload = Record<string, unknown>;

export async function registerAdminUser(
  adminToken: string,
  payload: AdminRegisterUserPayload
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin-register-user", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка регистрации");
  return data;
}
