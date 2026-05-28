import { apiFetchJson } from "../utils";
import type { AuthData } from "../types";

export const PROXY_API_SERVICE_REFRESH_FROM_1C_URL = "/api/service-refresh-from-1c";

export type ServiceRefreshKind = "perevozki" | "invoices" | "acts" | "sendings" | "orders";

export type ServiceRefreshKindResult = {
  kind: ServiceRefreshKind;
  dateFrom: string;
  dateTo: string;
  fetched: number;
  cacheTotal: number;
  detail?: string;
  error?: string;
};

export type ServiceRefreshResponse = {
  ok: boolean;
  dateFrom: string;
  dateTo: string;
  kinds: ServiceRefreshKindResult[];
  message?: string;
  error?: string;
};

export function serviceRefreshKindsForDocumentsSection(section: string): ServiceRefreshKind[] {
  switch (section) {
    case "Счета":
    case "ЭДО":
      return ["invoices", "perevozki"];
    case "УПД":
      return ["acts", "invoices", "perevozki"];
    case "Заявки":
      return ["orders"];
    case "Отправки":
      return ["sendings", "perevozki"];
    default:
      return [];
  }
}

export async function postServiceRefreshFrom1c(args: {
  auth: AuthData;
  dateFrom: string;
  dateTo: string;
  kinds: ServiceRefreshKind[];
}): Promise<ServiceRefreshResponse> {
  const { auth, dateFrom, dateTo, kinds } = args;
  if (!auth?.login || !auth?.password) {
    throw new Error("Требуется авторизация");
  }
  return apiFetchJson<ServiceRefreshResponse>(PROXY_API_SERVICE_REFRESH_FROM_1C_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      dateFrom,
      dateTo,
      kinds,
      serviceMode: true,
      ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
    }),
  });
}
