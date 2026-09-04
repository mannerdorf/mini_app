/**
 * Загрузка данных для аналитики HAULZ в приложении (служебный режим).
 */

import {
  PROXY_API_BASE_URL,
  PROXY_API_CARGO_TIMELINE_REPORT_URL,
  PROXY_API_INVOICES_URL,
  PROXY_API_SENDINGS_URL,
} from "../../constants/config";
import { apiFetchJson } from "../../utils";
import type { SendingItem } from "../lib/adminSendingsAnalytics";
import type { CargoTimelineReport } from "../../lib/adminCargoTimelineReport";
import type { CargoTimelineDelayFilter } from "../../lib/cargoTimelineReportShared";
import type { AuthData, CargoItem } from "../types";
import type { AdminPerevozkiDateField } from "./admin/perevozki";

function authBody(auth: AuthData): Record<string, unknown> {
  return {
    login: auth.login,
    password: auth.password,
    ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
  };
}

export async function fetchHaulzSendings(
  auth: AuthData,
  dateRange: { dateFrom: string; dateTo: string },
  useServiceRequest: boolean,
): Promise<SendingItem[]> {
  const data = await apiFetchJson<{ items?: unknown[] } | unknown[]>(PROXY_API_SENDINGS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...authBody(auth),
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      serviceMode: useServiceRequest,
      ...(useServiceRequest ? {} : auth.inn ? { inn: auth.inn } : {}),
    }),
  });
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as { items?: unknown[] }).items ?? []
      : [];
  return Array.isArray(list) ? (list as SendingItem[]) : [];
}

export async function fetchHaulzPerevozki(
  auth: AuthData,
  dateRange: { dateFrom: string; dateTo: string },
  useServiceRequest: boolean,
  options?: { dateField?: AdminPerevozkiDateField },
): Promise<CargoItem[]> {
  const dateField = options?.dateField;
  const data = await apiFetchJson<{ items?: unknown[] } | unknown[]>(PROXY_API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...authBody(auth),
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      serviceMode: useServiceRequest,
      ...(dateField && dateField !== "default" ? { dateField } : {}),
      ...(useServiceRequest ? {} : auth.inn ? { inn: auth.inn } : {}),
    }),
  });
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "items" in data
      ? (data as { items: unknown[] }).items
      : [];
  return (Array.isArray(list) ? list : []) as CargoItem[];
}

export async function fetchHaulzInvoices(
  auth: AuthData,
  dateRange: { dateFrom: string; dateTo: string },
  useServiceRequest: boolean,
): Promise<unknown[]> {
  const data = await apiFetchJson<{ items?: unknown[]; Invoices?: unknown[]; invoices?: unknown[] } | unknown[]>(
    PROXY_API_INVOICES_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...authBody(auth),
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        serviceMode: useServiceRequest,
        ...(useServiceRequest ? {} : auth.inn ? { inn: auth.inn } : {}),
      }),
    },
  );
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).items ??
        (data as Record<string, unknown>).Invoices ??
        (data as Record<string, unknown>).invoices ??
        []
      : [];
  return Array.isArray(list) ? list : [];
}

export async function fetchHaulzCargoTimelineReport(
  auth: AuthData,
  params: {
    dateFrom: string;
    dateTo: string;
    routeFilter?: "all" | "MSK-KGD" | "KGD-MSK";
    delayFilter?: CargoTimelineDelayFilter;
  },
  useServiceRequest: boolean,
): Promise<CargoTimelineReport> {
  const data = await apiFetchJson<CargoTimelineReport>(PROXY_API_CARGO_TIMELINE_REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...authBody(auth),
      ...params,
      serviceMode: useServiceRequest,
    }),
  });
  return data;
}
