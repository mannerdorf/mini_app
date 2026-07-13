/** Профиль: табель подразделения, бухгалтерия, претензии. */

import { apiErrorMessage, fetchJson, loginPasswordHeaders, type LoginPasswordAuth } from "../_base";

export async function postMyDepartmentTimesheet(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return myDepartmentTimesheetRequest(auth, "POST", body);
}

export async function patchMyDepartmentTimesheet(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return myDepartmentTimesheetRequest(auth, "PATCH", body);
}

export async function putMyDepartmentTimesheet(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return myDepartmentTimesheetRequest(auth, "PUT", body);
}

export async function deleteMyDepartmentTimesheet(
  auth: LoginPasswordAuth,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return myDepartmentTimesheetRequest(auth, "DELETE", body);
}

async function myDepartmentTimesheetRequest(
  auth: LoginPasswordAuth,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/my-department-timesheet", {
    method,
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password, ...body }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка запроса"));
  return data;
}

export async function fetchAccountingExpenseRequests(
  auth: LoginPasswordAuth,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/accounting-expense-requests", {
    method: "GET",
    headers: loginPasswordHeaders(auth),
    ...init,
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки"));
  return data;
}

export async function patchAccountingExpenseRequestStatus(
  auth: LoginPasswordAuth,
  uid: string,
  status: "sent" | "paid",
): Promise<void> {
  const { ok, data } = await fetchJson<{ error?: string }>("/api/accounting-expense-requests", {
    method: "PATCH",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ uid, status }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка обновления статуса"));
}

export async function fetchAccountingExpenseAttachmentBlob(
  auth: LoginPasswordAuth,
  requestUid: string,
  attachmentId: string | number,
): Promise<Blob | null> {
  const res = await fetch(
    `/api/accounting-expense-attachment?requestUid=${encodeURIComponent(requestUid)}&attachmentId=${attachmentId}`,
    { headers: { "x-login": auth.login, "x-password": auth.password } },
  );
  if (!res.ok) return null;
  return res.blob();
}

export async function fetchAccountingSverkiRequests(auth: LoginPasswordAuth): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/accounting-sverki-requests", {
    method: "GET",
    headers: loginPasswordHeaders(auth),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки"));
  return data;
}

export async function postAccountingSverkiRequests(
  auth: LoginPasswordAuth,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/accounting-sverki-requests", {
    method: "POST",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password, ...body }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка запроса"));
  return data;
}

export async function deleteAccountingSverkiRequest(auth: LoginPasswordAuth, id: string | number): Promise<void> {
  const { ok, data } = await fetchJson<{ error?: string }>(`/api/accounting-sverki-requests?id=${id}`, {
    method: "DELETE",
    headers: loginPasswordHeaders(auth),
    body: JSON.stringify({ login: auth.login, password: auth.password }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка удаления"));
}

export async function fetchProfileClaims(
  auth: LoginPasswordAuth,
  params: URLSearchParams,
  options?: { inn?: string },
): Promise<Record<string, unknown>> {
  const qs = params.toString();
  const extra: Record<string, string> = {};
  if (options?.inn) extra["x-inn"] = options.inn;
  const { ok, data } = await fetchJson<Record<string, unknown>>(`/api/claims${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: loginPasswordHeaders(auth, extra),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки претензий"));
  return data;
}
