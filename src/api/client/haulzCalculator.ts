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

export type { HaulzCalculatorFormState };

export type HaulzCalcDraft = {
  id: number;
  title: string | null;
  status: "draft" | "submitted";
  nomerZayavki: string | null;
  formState: HaulzCalculatorFormState;
  quoteResult: QuoteResult | null;
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
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function parseError(res: Response, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  return `HTTP ${res.status}`;
}

export type HaulzPartyByInn = {
  inn: string;
  kpp?: string;
  ogrn?: string;
  type: "LEGAL" | "INDIVIDUAL";
  fullName: string;
  shortName?: string;
  status?: string;
};

export async function fetchHaulzPartyByInn(auth: AuthData, inn: string): Promise<HaulzPartyByInn> {
  const digits = inn.replace(/\D/g, "");
  const res = await fetch("/api/haulz-calculator/party-by-inn", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ inn: digits }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const party = (data as { party?: HaulzPartyByInn }).party;
  if (!party?.fullName) throw new Error("Организация не найдена");
  return party;
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
  const mapsApiKey = (data as { mapsApiKey?: string }).mapsApiKey;
  const cityCenters = (data as { cityCenters?: HaulzMapsConfig["cityCenters"] }).cityCenters;
  if (!mapsApiKey) throw new Error("Нет ключа карты");
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

export async function fetchHaulzRingDistance(
  auth: AuthData,
  city: "moscow" | "kaliningrad",
  point: { lat: number; lon: number },
): Promise<number> {
  const res = await fetch("/api/haulz-calculator/distance", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ city, lat: point.lat, lon: point.lon }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return Number((data as { km?: number }).km) || 0;
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
    fromParty?: { mode: "courier" | "point"; phone?: string; fullName?: string };
    toParty?: { mode: "courier" | "point"; phone?: string; fullName?: string };
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

export async function sendHaulzQuoteEmail(
  auth: AuthData,
  body: {
    email: string;
  } & Parameters<typeof fetchHaulzQuote>[1] & { dataZabora?: string },
): Promise<void> {
  const res = await fetch("/api/haulz-calculator/send-quote-email", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
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
