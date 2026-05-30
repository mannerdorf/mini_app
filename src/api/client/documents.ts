/**
 * HTTP-клиент разделов «Документы» (без SWR — точечные загрузки по вкладкам).
 */

import { apiFetchJson } from "../../utils";
import { documentsAuthHeaders, documentsFetchJson, type DocumentsAuth } from "./documentsAuth";

export type { DocumentsAuth } from "./documentsAuth";
export * from "./documentsClaims";
export * from "./documentsSendings";
export * from "./documentsOrders";

export type DocumentsInnScope = {
  inn?: string;
  /** Сервисный режим — без фильтра по ИНН */
  serviceMode?: boolean;
};

function documentsQuery(scope: DocumentsInnScope): string {
  const params = new URLSearchParams();
  if (!scope.serviceMode && scope.inn) params.set("inn", scope.inn);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export type TariffRow = {
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
};

export async function fetchTariffs(scope: DocumentsInnScope): Promise<TariffRow[]> {
  try {
    const data = await apiFetchJson<{ tariffs?: TariffRow[] }>(
      `/api/tariffs${documentsQuery(scope)}`
    );
    return data.tariffs ?? [];
  } catch {
    return [];
  }
}

export type SverkiRow = {
  id?: number | string;
  [key: string]: unknown;
};

export type SverkiFetchResult = {
  url: string;
  status: number | null;
  ok: boolean;
  body: unknown;
  list: SverkiRow[];
  error?: string;
};

/** Акты сверок — с метаданными для отладки UI */
export async function fetchSverki(scope: DocumentsInnScope): Promise<SverkiFetchResult> {
  const url = `/api/sverki${documentsQuery(scope)}`;
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => null);
    const list = Array.isArray((body as { sverki?: unknown })?.sverki)
      ? ((body as { sverki: SverkiRow[] }).sverki)
      : [];
    return {
      url,
      status: res.status,
      ok: res.ok,
      body,
      list: res.ok ? list : [],
      error: res.ok
        ? undefined
        : String(
            (body as { error?: string })?.error ||
              (body as { message?: string })?.message ||
              "HTTP error"
          ),
    };
  } catch (e: unknown) {
    return {
      url,
      status: null,
      ok: false,
      body: null,
      list: [],
      error: (e as Error)?.message || "Сетевая ошибка",
    };
  }
}

export async function fetchDogovors<T extends Record<string, unknown>>(
  scope: DocumentsInnScope
): Promise<T[]> {
  try {
    const data = await apiFetchJson<{ dogovors?: T[] }>(`/api/dogovors${documentsQuery(scope)}`);
    return Array.isArray(data?.dogovors) ? data.dogovors : [];
  } catch {
    return [];
  }
}

export async function fetchEdoCounterpartyInns(): Promise<string[]> {
  try {
    const data = await apiFetchJson<{ inns?: string[] }>("/api/edo-counterparty-inns");
    return Array.isArray(data?.inns) ? data.inns : [];
  } catch {
    return [];
  }
}

export type FerryListItem = { id: number; name: string; mmsi: string };

export async function fetchFerriesList(): Promise<FerryListItem[]> {
  try {
    const data = await apiFetchJson<{ ferries?: FerryListItem[] }>("/api/ferries-list");
    return data.ferries ?? [];
  } catch {
    return [];
  }
}

export type SendingsFerryMap = Record<
  string,
  { ferry_id: number; ferry_name: string; eta: string | null }
>;

export async function fetchSendingsFerryMap(
  login: string,
  password: string
): Promise<SendingsFerryMap> {
  try {
    const data = await apiFetchJson<{ map?: SendingsFerryMap }>("/api/sendings-ferry", {
      method: "GET",
      headers: { "x-login": login, "x-password": password },
    });
    return data?.map ?? {};
  } catch {
    return {};
  }
}

export type SverkiRequestRow = {
  id: number;
  customerInn: string;
  contract: string;
  periodFrom: string;
  periodTo: string;
  status: "pending" | "edo_sent";
  createdAt: string;
};

export async function fetchSverkiRequests(
  auth: DocumentsAuth,
  inn: string
): Promise<SverkiRequestRow[]> {
  try {
    const { ok, data } = await documentsFetchJson<{ requests?: SverkiRequestRow[] }>(
      `/api/sverki-requests?inn=${encodeURIComponent(inn)}`,
      { method: "GET", headers: documentsAuthHeaders(auth) }
    );
    return ok && Array.isArray(data.requests) ? data.requests : [];
  } catch {
    return [];
  }
}

export async function postSverkiRequest(
  auth: DocumentsAuth,
  body: {
    customerInn: string;
    periodFrom: string;
    periodTo: string;
    contract: string;
  }
): Promise<void> {
  const { ok, data } = await documentsFetchJson<{ error?: string }>("/api/sverki-requests", {
    method: "POST",
    headers: documentsAuthHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(data?.error || "Не удалось создать заявку");
}

/** Подписи договоров для заказа акта сверки */
export async function fetchDogovorContractLabels(inn: string): Promise<string[]> {
  try {
    const data = await apiFetchJson<{ dogovors?: Array<{ docNumber?: string; title?: string }> }>(
      `/api/dogovors?inn=${encodeURIComponent(inn)}`
    );
    const rows = Array.isArray(data?.dogovors) ? data.dogovors : [];
    return Array.from(
      new Set(
        rows
          .map((row) => {
            const number = String(row?.docNumber || "").trim();
            const title = String(row?.title || "").trim();
            if (number && title) return `${number} - ${title}`;
            return number || title;
          })
          .filter(Boolean)
      )
    );
  } catch {
    return [];
  }
}

export type DownloadDocumentPayload = {
  data: string;
  name?: string;
  isHtml?: boolean;
  message?: string;
  error?: string;
};

export async function postDownloadDocument(
  body: Record<string, unknown>
): Promise<DownloadDocumentPayload> {
  const { ok, data } = await documentsFetchJson<DownloadDocumentPayload>("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(data?.message || data?.error || "Не удалось получить документ");
  if (!data?.data) throw new Error("Документ не найден");
  return data;
}

export async function postOrderCreate(body: {
  login: string;
  password: string;
  punktOtpravki: string;
  punktNaznacheniya: string;
  nomerZayavki: string;
  dataZabora: string;
  tableRows: unknown[];
}): Promise<void> {
  const { ok, data } = await documentsFetchJson<{ error?: string }>("/api/order-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(data?.error || "Ошибка создания заявки");
}
