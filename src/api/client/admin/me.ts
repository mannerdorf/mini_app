/**
 * Admin API: текущий пользователь CMS.
 */

import { adminAuthHeaders } from "./auth";

export type AdminMeResponse = {
  isSuperAdmin?: boolean;
};

export async function fetchAdminMe(adminToken: string): Promise<AdminMeResponse> {
  const res = await fetch("/api/admin-me", { headers: adminAuthHeaders(adminToken) });
  if (!res.ok) return {};
  return (await res.json().catch(() => ({}))) as AdminMeResponse;
}
