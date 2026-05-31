/**
 * Admin API: табель и выплаты сотрудников.
 */

import { adminAuthHeaders } from "./auth";

export type AdminTimesheetData = {
  entries: Record<string, unknown>;
  paymentMarks: Record<string, unknown>;
  shiftRateOverrides: Record<string, unknown>;
  payoutsByEmployee: Record<string, unknown>;
};

function throwIfUnauthorized(res: Response): void {
  if (res.status === 401) {
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
}

async function parseTimesheetError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throwIfUnauthorized(res);
  throw new Error(data.error || fallback);
}

export async function fetchAdminTimesheet(adminToken: string, month: string): Promise<AdminTimesheetData> {
  const res = await fetch(`/api/admin-timesheet?month=${encodeURIComponent(month)}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as AdminTimesheetData & { error?: string; entries?: Record<string, unknown>; paymentMarks?: Record<string, unknown>; shiftRateOverrides?: Record<string, unknown>; payoutsByEmployee?: Record<string, unknown> };
  throwIfUnauthorized(res);
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки табеля");
  return {
    entries: data.entries && typeof data.entries === "object" ? data.entries : {},
    paymentMarks: data.paymentMarks && typeof data.paymentMarks === "object" ? data.paymentMarks : {},
    shiftRateOverrides: data.shiftRateOverrides && typeof data.shiftRateOverrides === "object" ? data.shiftRateOverrides : {},
    payoutsByEmployee: data.payoutsByEmployee && typeof data.payoutsByEmployee === "object" ? data.payoutsByEmployee : {},
  };
}

export async function putAdminTimesheetCell(
  adminToken: string,
  payload: { month: string; employeeId: number; date: string; value: string }
): Promise<void> {
  const res = await fetch("/api/admin-timesheet", {
    method: "PUT",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  await parseTimesheetError(res, "Ошибка сохранения табеля");
}

export async function patchAdminTimesheet(
  adminToken: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch("/api/admin-timesheet", {
    method: "PATCH",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  await parseTimesheetError(res, "Ошибка сохранения");
}

export async function postAdminTimesheetPayout(
  adminToken: string,
  payload: { month: string; employeeId: number }
): Promise<void> {
  const res = await fetch("/api/admin-timesheet", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  await parseTimesheetError(res, "Ошибка проведения выплаты");
}

export async function deleteAdminTimesheetPayout(
  adminToken: string,
  payload: { month: string; employeeId: number; payoutId: number }
): Promise<void> {
  const res = await fetch("/api/admin-timesheet", {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  await parseTimesheetError(res, "Ошибка удаления выплаты");
}
