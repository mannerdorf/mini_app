import type { AuthData } from "../../types";
import type { StopMatchMode } from "../../../lib/haulzReturns/stopWords";

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

export type GlobalStopWordDto = {
  id: number;
  word: string;
  result: string;
  matchMode: StopMatchMode;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error ?? res.statusText ?? "Ошибка запроса"));
  }
  return data;
}

export async function listGlobalStopWords(auth: AuthData): Promise<GlobalStopWordDto[]> {
  const res = await fetch("/api/haulz-returns/stop-words", { headers: authHeaders(auth) });
  const data = await parseJson(res);
  return Array.isArray(data.words) ? (data.words as GlobalStopWordDto[]) : [];
}

export async function upsertGlobalStopWord(
  auth: AuthData,
  word: string,
  matchMode: StopMatchMode,
  result = "STOP",
): Promise<GlobalStopWordDto> {
  const res = await fetch("/api/haulz-returns/stop-words", {
    method: "POST",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ word, result, matchMode }),
  });
  const data = await parseJson(res);
  return data.word as GlobalStopWordDto;
}

export async function patchGlobalStopWordMatchMode(
  auth: AuthData,
  id: number,
  matchMode: StopMatchMode,
): Promise<void> {
  const res = await fetch("/api/haulz-returns/stop-words", {
    method: "PATCH",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ id, matchMode }),
  });
  await parseJson(res);
}

export async function deleteGlobalStopWord(
  auth: AuthData,
  opts: { id?: number; rowId?: string },
): Promise<void> {
  const res = await fetch("/api/haulz-returns/stop-words", {
    method: "DELETE",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  await parseJson(res);
}
