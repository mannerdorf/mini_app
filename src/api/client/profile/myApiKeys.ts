/**
 * Управление персональными API-ключами (Профиль → API).
 */

import type { UserApiKeyScopeClient } from "../../../constants/userApiKeyScopesClient";

export type MyApiKeyRow = {
  id: string;
  label: string;
  key_hint: string;
  key_prefix?: string;
  scopes: string[];
  allowed_inns: string[];
  created_at: string;
  last_used_at: string | null;
};

export type MyApiKeysListResponse = {
  keys: MyApiKeyRow[];
  assignable_inns: string[];
  available_scopes?: string[];
  error?: string;
};

export type MyApiKeysCreateResponse = {
  id?: string;
  token?: string;
  warning?: string;
  error?: string;
};

export type MyApiKeysRevokeResponse = {
  ok?: boolean;
  error?: string;
};

function profileAuthHeaders(login: string, password: string): Record<string, string> {
  return {
    "x-login": login,
    "x-password": password,
  };
}

export function formatMyApiKeysError(status: number, message: string | undefined): string {
  const msg = message?.trim() || "";
  if (status === 401) return msg || "Неверный логин или пароль";
  if (status === 403) {
    return msg || "Нет доступа. Нужно право «Служебный режим» (service_mode).";
  }
  if (status === 400) return msg || "Некорректный запрос";
  if (status === 404) return msg || "Ключ не найден или уже отозван";
  if (status >= 500) return msg || "Ошибка сервера. Попробуйте позже.";
  return msg || "Ошибка запроса";
}

export async function fetchMyApiKeys(login: string, password: string): Promise<MyApiKeysListResponse> {
  const res = await fetch("/api/my-api-keys", {
    method: "GET",
    headers: profileAuthHeaders(login, password),
  });
  const data = (await res.json().catch(() => ({}))) as MyApiKeysListResponse;
  if (!res.ok) {
    throw new Error(formatMyApiKeysError(res.status, data.error));
  }
  return {
    keys: Array.isArray(data.keys) ? data.keys : [],
    assignable_inns: Array.isArray(data.assignable_inns) ? data.assignable_inns.map(String) : [],
    available_scopes: Array.isArray(data.available_scopes) ? data.available_scopes.map(String) : undefined,
  };
}

export type CreateMyApiKeyParams = {
  login: string;
  password: string;
  label: string;
  scopes: UserApiKeyScopeClient[];
  allowed_inns: string[];
};

export async function createMyApiKey(params: CreateMyApiKeyParams): Promise<MyApiKeysCreateResponse> {
  const { login, password, label, scopes, allowed_inns } = params;
  const res = await fetch("/api/my-api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, label, scopes, allowed_inns }),
  });
  const data = (await res.json().catch(() => ({}))) as MyApiKeysCreateResponse;
  if (!res.ok) {
    throw new Error(formatMyApiKeysError(res.status, data.error));
  }
  return data;
}

export async function revokeMyApiKey(login: string, password: string, id: string): Promise<void> {
  const res = await fetch(`/api/my-api-keys?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: profileAuthHeaders(login, password),
  });
  const data = (await res.json().catch(() => ({}))) as MyApiKeysRevokeResponse;
  if (!res.ok) {
    throw new Error(formatMyApiKeysError(res.status, data.error));
  }
}
