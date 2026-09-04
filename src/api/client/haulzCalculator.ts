import type { AuthData } from "../../types";
import type {
  AddressSelection,
  CalculatorOptions,
  Direction,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "../../../lib/haulzCalculator/types";
import type { HaulzCalculatorFormState } from "../../../lib/haulzCalculator/calculatorDraft.js";
import type { HaulzCalcDraftStatus } from "../../../lib/haulzCalculator/draftStatus.js";
import { resolveApiOrigin } from "../../lib/resolveApiOrigin.js";
import type { Order1cUpstreamRequestMeta } from "../../features/documents/orders/DocumentsOrderQuoteSummary";

export type { HaulzCalculatorFormState, HaulzCalcDraftStatus };

export type DocumentsOrderJournalView = {
  customerName: string;
  customerRequestNumber: string;
  senderPoint: string;
  destinationPoint: string;
  senderName: string;
  receiverName: string;
  routeLabel: string;
  pickupDate: string;
  fivepostRows: Array<Record<string, unknown>>;
  legacyTableRows: Array<Record<string, unknown>>;
};

export type HaulzCalcDraft = {
  id: number;
  title: string | null;
  status: HaulzCalcDraftStatus;
  nomerZayavki: string | null;
  formState: HaulzCalculatorFormState;
  quoteResult: QuoteResult | null;
  recipientEmail?: string | null;
  loginKey?: string;
  documentsOrderJournal?: DocumentsOrderJournalView;
  createdAt: string;
  updatedAt: string;
};

export type HaulzSuggestItem = {
  id?: string;
  uri?: string;
  label: string;
  fullAddress: string;
  point?: { lat: number; lon: number };
};

export type HaulzMapsConfig = {
  mapsApiKey: string;
  cityCenters: Record<string, { lat: number; lon: number; zoom: number }>;
};

export type HaulzGeocodeResult = {
  label: string;
  fullAddress: string;
  point: { lat: number; lon: number };
};

function authHeaders(auth: AuthData): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth.login?.trim() && auth.password?.trim()) {
    headers["x-login"] = auth.login;
    headers["x-password"] = auth.password;
  }
  return headers;
}

function parseError(res: Response, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  if (res.status === 502) {
    return "HTTP 502: сервис подсказок временно недоступен";
  }
  if (res.status === 503) {
    return "HTTP 503: сервис временно недоступен";
  }
  if (res.status === 504) {
    return "HTTP 504: сервер долго не отвечает";
  }
  return `HTTP ${res.status}`;
}

export type HaulzPartnerDirectoryInfo = {
  kind: "active_partner" | "need_contract" | "new_partner";
  label: string;
  contractNumber?: string;
  inCustomerDirectory: boolean;
  customerName?: string;
  hasEdo: boolean;
};

export type HaulzPartyByInn = {
  inn: string;
  kpp?: string;
  ogrn?: string;
  type: "LEGAL" | "INDIVIDUAL";
  fullName: string;
  shortName?: string;
  status?: string;
};

export type HaulzPartyByInnResult = {
  party: HaulzPartyByInn;
  partnerDirectory: HaulzPartnerDirectoryInfo;
};

export async function fetchHaulzPartyByInn(auth: AuthData, inn: string): Promise<HaulzPartyByInnResult> {
  const digits = inn.replace(/\D/g, "");
  const res = await fetch("/api/haulz-calculator/party-by-inn", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ inn: digits }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const party = (data as { party?: HaulzPartyByInn }).party;
  const partnerDirectory = (data as { partnerDirectory?: HaulzPartnerDirectoryInfo }).partnerDirectory;
  if (!party?.fullName) throw new Error("Организация не найдена");
  if (!partnerDirectory?.label) throw new Error("Не удалось проверить партнёра");
  return { party, partnerDirectory };
}

export async function fetchHaulzAddressSuggest(
  auth: AuthData,
  q: string,
  city?: "moscow" | "kaliningrad",
): Promise<HaulzSuggestItem[]> {
  const res = await fetch("/api/haulz-calculator/suggest", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ q, city }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { items?: HaulzSuggestItem[] }).items ?? [];
}

export async function fetchHaulzMapsConfig(auth: AuthData): Promise<HaulzMapsConfig> {
  const res = await fetch("/api/haulz-calculator/maps-config", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const mapsApiKey = String((data as { mapsApiKey?: string }).mapsApiKey ?? "");
  const cityCenters = (data as { cityCenters?: HaulzMapsConfig["cityCenters"] }).cityCenters;
  return { mapsApiKey, cityCenters: cityCenters ?? {} };
}

export async function fetchHaulzGeocode(
  auth: AuthData,
  body: { lat: number; lon: number; city?: "moscow" | "kaliningrad" } | { address: string; uri?: string; city?: "moscow" | "kaliningrad" },
): Promise<HaulzGeocodeResult> {
  const res = await fetch("/api/haulz-calculator/geocode", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const point = (data as { point?: { lat: number; lon: number } }).point;
  const fullAddress = (data as { fullAddress?: string }).fullAddress;
  if (!point || !fullAddress) throw new Error("Пустой ответ геокодера");
  return {
    label: String((data as { label?: string }).label || fullAddress),
    fullAddress,
    point,
  };
}

export type HaulzRingDistance = {
  km: number;
  osrmKm: number | null;
  dgisKm: number | null;
};

export async function fetchHaulzRingDistance(
  auth: AuthData,
  city: "moscow" | "kaliningrad",
  point: { lat: number; lon: number },
): Promise<HaulzRingDistance> {
  const res = await fetch("/api/haulz-calculator/distance", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ city, lat: point.lat, lon: point.lon }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const km = Number((data as { km?: number }).km) || 0;
  const osrmRaw = (data as { osrmKm?: number | null }).osrmKm;
  const dgisRaw = (data as { dgisKm?: number | null }).dgisKm;
  const osrmKm = osrmRaw != null && Number.isFinite(Number(osrmRaw)) ? Number(osrmRaw) : null;
  const dgisKm = dgisRaw != null && Number.isFinite(Number(dgisRaw)) ? Number(dgisRaw) : null;
  return { km, osrmKm, dgisKm };
}

export async function fetchHaulzCalculatorOptions(
  auth: AuthData,
  direction: Direction,
  chargeableKg?: number,
): Promise<CalculatorOptions> {
  const params = new URLSearchParams({ direction });
  if (chargeableKg != null && chargeableKg > 0) params.set("chargeable_kg", String(chargeableKg));
  const res = await fetch(`/api/haulz-calculator/options?${params}`, { headers: authHeaders(auth) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const options = (data as { options?: CalculatorOptions }).options;
  if (!options) throw new Error("Пустой ответ опций");
  return options;
}

export async function fetchHaulzQuote(
  auth: AuthData,
  body: {
    from: AddressSelection;
    to: AddressSelection;
    places: ParcelPlace[];
    mainlineMode: MainlineMode;
    direction?: Direction;
    declaredValueRub?: number;
    extraCodes?: string[];
    kmOverride?: { moscow?: number; kaliningrad?: number };
    saveQuote?: boolean;
    fromParty?: {
      mode: "courier" | "point";
      inn?: string;
      phone?: string;
      companyName?: string;
      fullName?: string;
    };
    toParty?: {
      mode: "courier" | "point";
      inn?: string;
      phone?: string;
      companyName?: string;
      fullName?: string;
    };
    customerParty?: {
      inn?: string;
      companyName?: string;
    };
  },
): Promise<QuoteResult> {
  const res = await fetch("/api/haulz-calculator/quote", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const quote = (data as { quote?: QuoteResult }).quote;
  if (!quote) throw new Error("Пустой ответ расчёта");
  return quote;
}

export async function fetchHaulzCalcDrafts(auth: AuthData): Promise<HaulzCalcDraft[]> {
  const res = await fetch("/api/haulz-calculator/drafts", {
    method: "GET",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { drafts?: HaulzCalcDraft[] }).drafts ?? [];
}

export async function fetchHaulzCalcSavedDrafts(auth: AuthData): Promise<HaulzCalcDraft[]> {
  const res = await fetch("/api/haulz-calculator/drafts?scope=saved", {
    method: "GET",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { drafts?: HaulzCalcDraft[] }).drafts ?? [];
}

export async function fetchHaulzCalcDraft(auth: AuthData, id: number): Promise<HaulzCalcDraft> {
  const res = await fetch(`/api/haulz-calculator/drafts?id=${id}`, {
    method: "GET",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const draft = (data as { draft?: HaulzCalcDraft }).draft;
  if (!draft) throw new Error("Черновик не найден");
  return draft;
}

export async function saveHaulzCalcDraft(
  auth: AuthData,
  body: {
    id?: number;
    title?: string;
    status?: "draft" | "submitted";
    nomerZayavki?: string;
    formState: HaulzCalculatorFormState;
    quote?: QuoteResult | null;
  },
): Promise<HaulzCalcDraft> {
  const res = await fetch("/api/haulz-calculator/drafts", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({
      id: body.id,
      title: body.title,
      status: body.status,
      nomerZayavki: body.nomerZayavki,
      formState: body.formState,
      quote: body.quote ?? null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const draft = (data as { draft?: HaulzCalcDraft }).draft;
  if (!draft) throw new Error("Не удалось сохранить");
  return draft;
}

export async function deleteHaulzCalcDraft(auth: AuthData, id: number): Promise<void> {
  const res = await fetch(`/api/haulz-calculator/drafts?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
}

export async function deleteHaulzCalcDraftManager(auth: AuthData, id: number): Promise<void> {
  const res = await fetch(`/api/haulz-calculator/drafts-manager?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
}

export async function previewHaulzQuoteEmail(
  auth: AuthData,
  body: Parameters<typeof fetchHaulzQuote>[1] & {
    dataZabora?: string;
    customerParty?: Parameters<typeof fetchHaulzQuote>[1]["fromParty"];
    fromParty?: Parameters<typeof fetchHaulzQuote>[1]["fromParty"];
    toParty?: Parameters<typeof fetchHaulzQuote>[1]["toParty"];
  },
): Promise<{ html: string; subject: string }> {
  const res = await fetch("/api/haulz-calculator/preview-quote-email", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const html = String((data as { html?: string }).html ?? "");
  const subject = String((data as { subject?: string }).subject ?? "");
  if (!html) throw new Error("Пустой предпросмотр");
  return { html, subject };
}

export async function sendHaulzQuoteEmail(
  auth: AuthData,
  body: {
    email: string;
    nomerZayavki: string;
    formState: HaulzCalculatorFormState;
    draftId?: number;
  } & Parameters<typeof fetchHaulzQuote>[1] & { dataZabora?: string },
): Promise<{ draftId?: number }> {
  const res = await fetch("/api/haulz-calculator/send-quote-email", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return { draftId: (data as { draftId?: number }).draftId };
}

export async function fetchHaulzCalcDraftsManager(auth: AuthData): Promise<HaulzCalcDraft[]> {
  const res = await fetch("/api/haulz-calculator/drafts-manager", {
    method: "GET",
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { drafts?: HaulzCalcDraft[] }).drafts ?? [];
}

export async function patchHaulzCalcDraftStatus(
  auth: AuthData,
  id: number,
  status: HaulzCalcDraftStatus,
): Promise<HaulzCalcDraft> {
  const res = await fetch("/api/haulz-calculator/draft-status", {
    method: "PATCH",
    headers: authHeaders(auth),
    body: JSON.stringify({ id, status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const draft = (data as { draft?: HaulzCalcDraft }).draft;
  if (!draft) throw new Error("Пустой ответ");
  return draft;
}

export type SubmitPendingOrderTo1cResult = {
  ok: boolean;
  message?: string;
  nomerZayavki?: string | null;
  request?: unknown;
  upstreamRequest?: Order1cUpstreamRequestMeta | null;
  upstream?: unknown;
  error?: string;
  request_id?: string;
  draft?: HaulzCalcDraft;
  apiRoute?: string;
  httpStatus?: number;
};

function parseSubmitPending1cResponse(
  res: Response,
  data: SubmitPendingOrderTo1cResult & { error?: string; path?: string },
  apiRoute: string,
): SubmitPendingOrderTo1cResult {
  const upstreamRequest = (data.upstreamRequest ?? null) as Order1cUpstreamRequestMeta | null;
  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      error: data.error || parseError(res, data),
      request: data.request,
      upstreamRequest,
      upstream: data.upstream ?? (data.path ? { path: data.path } : data),
      nomerZayavki: data.nomerZayavki ?? null,
      request_id: typeof data.request_id === "string" ? data.request_id : undefined,
      apiRoute,
    };
  }
  return {
    ok: true,
    httpStatus: res.status,
    message: data.message,
    nomerZayavki: data.nomerZayavki ?? null,
    request: data.request,
    upstreamRequest,
    upstream: data.upstream,
    draft: data.draft,
    request_id: typeof data.request_id === "string" ? data.request_id : undefined,
    apiRoute,
  };
}

export async function submitPendingOrderTo1c(
  auth: AuthData,
  draftId: number,
): Promise<SubmitPendingOrderTo1cResult> {
  const origin = resolveApiOrigin();
  const primaryRoute = `${origin}/api/haulz-calculator/submit-pending-1c`;
  const fallbackRoute = `${origin}/api/haulz-calculator/draft-status`;

  const tryRoute = async (
    apiRoute: string,
    body: Record<string, unknown>,
    method: "POST" | "PATCH" = "POST",
  ): Promise<SubmitPendingOrderTo1cResult> => {
    const res = await fetch(apiRoute, {
      method,
      headers: authHeaders(auth),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as SubmitPendingOrderTo1cResult & {
      error?: string;
      path?: string;
    };
    return parseSubmitPending1cResponse(res, data, apiRoute);
  };

  let result = await tryRoute(primaryRoute, { id: draftId });
  const routeMissing =
    !result.ok &&
    result.httpStatus === 404 &&
    (result.error === "API route not found" || String(result.error || "").includes("route not found"));

  if (routeMissing) {
    result = await tryRoute(fallbackRoute, { id: draftId, action: "submit-1c" });
  }

  return result;
}

export async function submitHaulzCalculatorOrder(
  auth: AuthData,
  body: Parameters<typeof fetchHaulzQuote>[1] & {
    dataZabora?: string;
    nomerZayavki?: string;
  },
): Promise<{ nomerZayavki: string; quote: QuoteResult; quoteId?: number }> {
  const res = await fetch("/api/haulz-calculator/order", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const nomerZayavki = String((data as { nomerZayavki?: string }).nomerZayavki ?? "");
  const quote = (data as { quote?: QuoteResult }).quote;
  if (!quote) throw new Error("Пустой ответ оформления");
  return {
    nomerZayavki,
    quote,
    quoteId: (data as { quoteId?: number }).quoteId ?? quote.quoteId,
  };
}

export async function submitGuestHaulzCalculatorOrder(
  body: Parameters<typeof fetchHaulzQuote>[1] & {
    dataZabora?: string;
    formState: HaulzCalculatorFormState;
    contactPhone: string;
    contactEmail: string;
  },
): Promise<{
  nomerZayavki: string;
  quote: QuoteResult;
  quoteId?: number;
  draftId?: number;
  message: string;
}> {
  const res = await fetch("/api/haulz-calculator/guest-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const nomerZayavki = String((data as { nomerZayavki?: string }).nomerZayavki ?? "");
  const quote = (data as { quote?: QuoteResult }).quote;
  if (!quote) throw new Error("Пустой ответ оформления");
  return {
    nomerZayavki,
    quote,
    quoteId: (data as { quoteId?: number }).quoteId ?? quote.quoteId,
    draftId: (data as { draftId?: number }).draftId,
    message: String((data as { message?: string }).message ?? "Заявка оформлена. Менеджер с вами свяжется."),
  };
}
