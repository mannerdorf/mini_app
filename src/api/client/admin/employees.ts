/**
 * Admin API: справочник сотрудников (EOR / табель).
 */

import { adminAuthHeaders } from "./auth";

export type AdminEmployeeDirectoryRow = {
  id: number;
  login: string;
  full_name: string;
  department: string;
  position: string;
  accrual_type: "hour" | "shift" | "month" | null;
  accrual_rate: number | null;
  cooperation_type: "self_employed" | "ip" | "staff" | null;
  employee_role: "employee" | "department_head";
  active: boolean;
  invited_with_preset_label: string | null;
  created_at: string;
};

export type AdminEmployeeRateHistoryRow = {
  id: number;
  effective_from: string;
  accrual_rate: number;
  created_at: string;
};

function throwIfUnauthorized(res: Response): void {
  if (res.status === 401) {
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
}

export async function fetchAdminEmployeeDirectory(
  adminToken: string,
  opts?: { month?: string }
): Promise<AdminEmployeeDirectoryRow[]> {
  const month = opts?.month?.trim();
  const monthQuery = month && /^\d{4}-\d{2}$/.test(month) ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`/api/admin-employee-directory${monthQuery}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { items?: AdminEmployeeDirectoryRow[]; error?: string };
  throwIfUnauthorized(res);
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки справочника сотрудников");
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchAdminEmployeeRateHistory(
  adminToken: string,
  employeeId: number
): Promise<AdminEmployeeRateHistoryRow[]> {
  const res = await fetch(`/api/admin-employee-directory?rate_history_for=${employeeId}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { rate_history?: AdminEmployeeRateHistoryRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки истории ставки");
  const raw = Array.isArray(data.rate_history) ? data.rate_history : [];
  return raw
    .map((r) => ({
      id: Number(r.id),
      effective_from: String(r.effective_from || "").slice(0, 10),
      accrual_rate: Number(r.accrual_rate ?? 0),
      created_at: String(r.created_at || ""),
    }))
    .filter((r) => Number.isFinite(r.id) && r.id > 0);
}

export async function createAdminEmployee(
  adminToken: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch("/api/admin-employee-directory", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка сохранения атрибутов сотрудника");
}

export async function patchAdminEmployee(
  adminToken: string,
  employeeId: number,
  body: Record<string, unknown>
): Promise<{ accrual_rate?: number }> {
  const res = await fetch(`/api/admin-employee-directory?id=${employeeId}`, {
    method: "PATCH",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { accrual_rate?: number; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка обновления");
  return data;
}

export async function deleteAdminEmployee(adminToken: string, employeeId: number): Promise<void> {
  const res = await fetch(`/api/admin-employee-directory?id=${employeeId}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка удаления");
}

export async function patchAdminEmployeeRateHistory(
  adminToken: string,
  rateHistoryId: number,
  body: Record<string, unknown>
): Promise<{ accrual_rate?: number }> {
  const res = await fetch(`/api/admin-employee-directory?rate_history_id=${rateHistoryId}`, {
    method: "PATCH",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { accrual_rate?: number; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
  return data;
}

export async function deleteAdminEmployeeRateHistory(
  adminToken: string,
  rateHistoryId: number,
  employeeId: number
): Promise<{ accrual_rate?: number }> {
  const res = await fetch(
    `/api/admin-employee-directory?rate_history_id=${rateHistoryId}&employee_id=${employeeId}`,
    { method: "DELETE", headers: adminAuthHeaders(adminToken) }
  );
  const data = (await res.json().catch(() => ({}))) as { accrual_rate?: number; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка удаления");
  return data;
}
