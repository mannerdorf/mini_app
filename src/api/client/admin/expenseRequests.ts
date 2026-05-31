/**
 * Admin API: заявки на расходы (список для суперадмина).
 */

import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { adminAuthHeaders } from "./auth";

export type AdminExpenseRequestRow = ExpenseRequestItem & { login?: string };

export async function fetchAdminExpenseRequests(adminToken: string): Promise<AdminExpenseRequestRow[]> {
  const res = await fetch("/api/admin-expense-requests", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { items?: AdminExpenseRequestRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки заявок на расходы");
  return Array.isArray(data.items) ? data.items : [];
}

export async function patchAdminExpenseRequest(
  adminToken: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch("/api/admin-expense-requests", {
    method: "PATCH",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

export async function deleteAdminExpenseRequest(adminToken: string, uid: string): Promise<boolean> {
  const res = await fetch(`/api/admin-expense-requests?uid=${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  return res.ok;
}

export async function updateAdminExpenseRequest(
  adminToken: string,
  payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/admin-expense-requests", {
    method: "PUT",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  const errData = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
  const detail = errData.details ? `: ${errData.details}` : "";
  return { ok: false, error: String(errData.error || "Ошибка сохранения заявки") + detail };
}
