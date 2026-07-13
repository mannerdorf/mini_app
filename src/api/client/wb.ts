/** Wildberries API client. */

import { apiErrorMessage, fetchJson } from "./_base";

export type WbAuthHeaders = Record<string, string>;

export async function wbFetchJson<T = Record<string, unknown>>(
  url: string,
  headers: WbAuthHeaders,
  init?: RequestInit,
): Promise<{ ok: boolean; data: T; res: Response }> {
  const merged: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  };
  return fetchJson<T>(url, merged);
}

export async function wbGet<T = Record<string, unknown>>(
  path: string,
  query: string,
  headers: WbAuthHeaders,
): Promise<{ ok: boolean; data: T }> {
  const url = query ? `${path}?${query}` : path;
  const { ok, data } = await wbFetchJson<T>(url, headers);
  return { ok, data };
}

export async function wbPost<T = Record<string, unknown>>(
  path: string,
  headers: WbAuthHeaders,
  body?: unknown,
): Promise<{ ok: boolean; data: T }> {
  const { ok, data } = await wbFetchJson<T>(path, headers, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok, data };
}

export async function wbFetchBlob(path: string, query: string, headers: WbAuthHeaders): Promise<Response> {
  const url = query ? `${path}?${query}` : path;
  return fetch(url, { headers });
}

export function wbApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return apiErrorMessage(data, fallback);
}

export async function wbFetchPosilka(
  code: string,
  headers: WbAuthHeaders,
  options?: { refresh?: boolean },
): Promise<{
  lastStatus: string;
  perevozka: string;
  posilkaSteps: Array<{ title: string; date: string }>;
}> {
  const refresh = options?.refresh ? "&refresh=1" : "";
  const u = `/api/wb/postb-getapi?kind=posilka${refresh}&code=${encodeURIComponent(code.trim())}`;
  const { ok, data } = await wbFetchJson<{
    lastStatus?: string;
    perevozka?: string;
    posilkaSteps?: Array<{ title: string; date: string }>;
  }>(u, headers);
  if (!ok) return { lastStatus: "", perevozka: "", posilkaSteps: [] };
  return {
    lastStatus: String(data.lastStatus ?? "").trim(),
    perevozka: String(data.perevozka ?? "").trim(),
    posilkaSteps: Array.isArray(data.posilkaSteps) ? data.posilkaSteps : [],
  };
}

export async function wbFetchPerevozkaSteps(
  number: string,
  headers: WbAuthHeaders,
): Promise<Array<{ title: string; date: string }>> {
  const u = `/api/wb/postb-getapi?kind=perevozka&number=${encodeURIComponent(number)}`;
  const { ok, data } = await wbFetchJson<{ steps?: Array<{ title: string; date: string }> }>(u, headers);
  if (!ok || !Array.isArray(data.steps)) return [];
  return data.steps;
}

export async function wbDelete(path: string, headers: WbAuthHeaders, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { ok, data } = await wbFetchJson<Record<string, unknown>>(path, headers, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok, data };
}

export async function wbPutForm(path: string, headers: WbAuthHeaders, formData: FormData): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { ok, data } = await wbFetchJson<Record<string, unknown>>(path, headers, {
    method: "PUT",
    body: formData,
  });
  return { ok, data };
}

export async function wbPostForm(
  path: string,
  headers: WbAuthHeaders,
  formData: FormData,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; rawText: string }> {
  const res = await fetch(path, { method: "POST", headers, body: formData });
  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data, rawText };
}
