/**
 * HTTP-клиент разделов «Документы» (без SWR — точечные загрузки по вкладкам).
 */

import { apiFetchJson } from "../../utils";

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
