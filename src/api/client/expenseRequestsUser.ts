/** Заявки на расходы (пользователь). */

import { apiErrorMessage, fetchJson, loginPasswordHeaders, type LoginPasswordAuth } from "./_base";

export async function fetchMyExpenseRequests(auth: LoginPasswordAuth): Promise<{ items?: unknown[] }> {
  const { ok, data } = await fetchJson<{ items?: unknown[]; error?: string }>("/api/my-expense-requests", {
    method: "GET",
    headers: loginPasswordHeaders(auth),
  });
  if (!ok) return { items: [] };
  return { items: data.items ?? [] };
}

export async function postMyExpenseRequest(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/my-expense-requests", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка сохранения"));
  return data;
}

export async function deleteMyExpenseRequest(auth: LoginPasswordAuth, uid: string): Promise<void> {
  const { ok, data } = await fetchJson<{ error?: string }>(`/api/my-expense-requests?uid=${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: loginPasswordHeaders(auth),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка удаления"));
}

export async function patchMyExpenseRequest(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { ok, status, data } = await fetchJson<Record<string, unknown>>("/api/my-expense-requests", {
    method: "PATCH",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify(body),
  });
  return { ok, data: { ...data, _status: status } };
}

export async function fetchExpenseRequestCategories(params: URLSearchParams): Promise<{ id: string; name: string }[]> {
  const qs = params.toString();
  const { ok, data } = await fetchJson<{ id?: string; name?: string }[] | { categories?: unknown[] }>(
    `/api/expense-request-categories${qs ? `?${qs}` : ""}`,
  );
  if (!ok) return [];
  if (Array.isArray(data)) return data.map((row) => ({ id: String(row?.id ?? ""), name: String(row?.name ?? "") }));
  return [];
}

export async function fetchExpenseRequestSuppliers(auth: LoginPasswordAuth): Promise<unknown[]> {
  const { ok, data } = await fetchJson<{ suppliers?: unknown[] }>("/api/expense-request-suppliers", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password }),
  });
  if (!ok) return [];
  return data.suppliers ?? [];
}

export async function postMyDepartmentTimesheetForExpense(
  auth: LoginPasswordAuth,
  month: string,
): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/my-department-timesheet", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password, month }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки подразделения"));
  return data;
}
