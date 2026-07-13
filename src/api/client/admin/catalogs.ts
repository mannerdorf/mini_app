/** Admin CMS: справочники (тарифы, сверки, договоры) и скачивание документов. */

import { adminAuthHeaders } from "./auth";
import { apiErrorMessage, fetchJson } from "../_base";

export type AdminTariffRow = {
  id: number;
  docDate: string | null;
  docNumber: string;
  customerName: string;
  customerInn: string;
  cityFrom: string;
  cityTo: string;
  transportType: string;
  isDangerous: boolean;
  isVet: boolean;
  tariff: number | null;
  fetchedAt: string;
};

export type AdminSverkiRow = {
  id: number;
  docNumber: string;
  docDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  customerName: string;
  customerInn: string;
  fetchedAt: string;
  edoStatus?: string | null;
  data?: Record<string, unknown> | null;
};

export type AdminDogovorRow = {
  id: number;
  docNumber: string;
  docDate: string | null;
  customerName: string;
  customerInn: string;
  title: string;
  fetchedAt: string;
  edoStatus?: string | null;
  data?: Record<string, unknown> | null;
};

export type AdminCacheRefreshResponse = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  text: string;
};

export async function fetchAdminTariffsList(): Promise<AdminTariffRow[]> {
  const { ok, data } = await fetchJson<{ tariffs?: AdminTariffRow[] }>("/api/tariffs");
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки тарифов"));
  return data.tariffs ?? [];
}

export async function fetchAdminSverkiList(): Promise<AdminSverkiRow[]> {
  const { ok, data } = await fetchJson<{ sverki?: AdminSverkiRow[] }>("/api/sverki");
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки актов сверок"));
  return data.sverki ?? [];
}

export async function fetchAdminDogovorsList(): Promise<AdminDogovorRow[]> {
  const { ok, data } = await fetchJson<{ dogovors?: AdminDogovorRow[] }>("/api/dogovors");
  if (!ok) throw new Error(apiErrorMessage(data, "Ошибка загрузки договоров"));
  return data.dogovors ?? [];
}

export async function postAdminCacheRefresh(
  adminToken: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<AdminCacheRefreshResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: adminAuthHeaders(adminToken, body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}

export function formatDocDateForDownload(docDateRaw: string | null): string {
  if (!docDateRaw) return "";
  const d = new Date(docDateRaw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

export async function downloadAdminDocument(body: {
  metod: string;
  number: string;
  dateDoc?: string;
  dateDog?: string;
  inn?: string;
}): Promise<{ data: string; name?: string; isHtml?: boolean }> {
  const { ok, data } = await fetchJson<{ data?: string; name?: string; isHtml?: boolean; message?: string; error?: string }>(
    "/api/download",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!ok) throw new Error(apiErrorMessage(data, (data as { message?: string }).message || "Не удалось получить документ"));
  if (!data.data) throw new Error("Документ не найден");
  return { data: String(data.data), name: data.name, isHtml: data.isHtml };
}
