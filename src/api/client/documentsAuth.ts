/** Заголовки 1С-аккаунта для API раздела «Документы». */

export type DocumentsAuth = {
  login: string;
  password: string;
  inn?: string;
};

export function documentsAuthHeaders(
  auth: DocumentsAuth,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-login": auth.login,
    "x-password": auth.password,
    ...extra,
  };
  const inn = String(auth.inn ?? "").trim();
  if (inn) headers["x-inn"] = inn;
  return headers;
}

export async function documentsFetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
