/** Профиль: сотрудники компании (my-employees). */

import { apiErrorMessage, fetchJson, type LoginPasswordAuth } from "../_base";

export type MyEmployeeRow = {
  id: number;
  login: string;
  fullName?: string;
  department?: string;
  presetLabel?: string;
  active?: boolean;
};

const jsonHeaders = { "Content-Type": "application/json" };

export async function listMyEmployees(auth: LoginPasswordAuth): Promise<{ employees: MyEmployeeRow[] }> {
  const { ok, data } = await fetchJson<{ employees?: MyEmployeeRow[]; error?: string }>("/api/my-employees", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ login: auth.login, password: auth.password }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки"));
  return { employees: data.employees ?? [] };
}

export async function inviteMyEmployee(
  auth: LoginPasswordAuth,
  body: { email: string; fullName: string; presetId: string },
): Promise<{ message?: string }> {
  const { ok, data } = await fetchJson<{ message?: string; error?: string }>("/api/my-employees", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      email: body.email,
      fullName: body.fullName,
      department: "",
      employeeRole: "employee",
      presetId: body.presetId,
    }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка"));
  return { message: data.message };
}

export async function patchMyEmployee(
  auth: LoginPasswordAuth,
  id: number,
  patch: { presetId?: string; active?: boolean },
): Promise<void> {
  const { ok, data } = await fetchJson<{ error?: string }>(`/api/my-employees?id=${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ login: auth.login, password: auth.password, ...patch }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка"));
}

export async function deleteMyEmployee(auth: LoginPasswordAuth, id: number): Promise<void> {
  const { ok, data } = await fetchJson<{ error?: string }>(`/api/my-employees?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: jsonHeaders,
    body: JSON.stringify({ login: auth.login, password: auth.password }),
  });
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка"));
}

export async function fetchRolePresets(): Promise<{ id: string; label: string }[]> {
  const { ok, data } = await fetchJson<{ presets?: { id: string; label: string }[] }>("/api/role-presets");
  if (!ok || !Array.isArray(data.presets)) return [];
  return data.presets.map((p) => ({ id: String(p.id), label: p.label || "" }));
}
