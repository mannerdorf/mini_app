import type { AuthData } from "../../types";
import type {
  AddressSelection,
  CalculatorOptions,
  Direction,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "../../../lib/haulzCalculator/types";

export type HaulzSuggestItem = {
  id?: string;
  label: string;
  fullAddress: string;
  point?: { lat: number; lon: number };
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

export async function fetchHaulzAddressSuggest(
  auth: AuthData,
  q: string,
  city?: "moscow" | "kaliningrad",
): Promise<HaulzSuggestItem[]> {
  const params = new URLSearchParams({ q });
  if (city) params.set("city", city);
  const res = await fetch(`/api/haulz-calculator/suggest?${params}`, { headers: authHeaders(auth) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { items?: HaulzSuggestItem[] }).items ?? [];
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
