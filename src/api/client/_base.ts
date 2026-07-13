/** Общие helpers для client API (Этап 0.5). */

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T; res: Response }> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data, res };
}

export type LoginPasswordAuth = { login: string; password: string };

export function loginPasswordHeaders(auth: LoginPasswordAuth, extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
    ...extra,
  };
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err.trim();
  }
  return fallback;
}
