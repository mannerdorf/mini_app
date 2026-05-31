/**
 * Admin API: заявки на акты сверки.
 */

import { adminAuthHeaders } from "./auth";

export type AdminSverkiRequestRow = {
  id: number;
  login: string;
  customerInn: string;
  contract: string;
  periodFrom: string;
  periodTo: string;
  status: "pending" | "edo_sent";
  createdAt: string;
  updatedAt: string;
};

export async function fetchAdminSverkiRequests(adminToken: string): Promise<AdminSverkiRequestRow[]> {
  const res = await fetch("/api/admin-sverki-requests", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { requests?: AdminSverkiRequestRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки заявок актов сверки");
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function updateAdminSverkiRequestStatus(
  adminToken: string,
  id: number,
  status: AdminSverkiRequestRow["status"]
): Promise<void> {
  const res = await fetch("/api/admin-sverki-requests-update", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id, status }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка обновления статуса заявки");
}

export async function deleteAdminSverkiRequest(adminToken: string, id: number): Promise<void> {
  const res = await fetch("/api/admin-sverki-requests-update", {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка удаления заявки");
}
