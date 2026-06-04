import type { AddressSuggestItem } from "./yandexClient.js";
import { yandexFetchJson } from "./yandexClient.js";

const YANDEX_SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";

/** API Геосаджеста — подсказки при вводе адреса. */
export function getYandexGeosuggestApiKeyOrNull(): string | null {
  const k = String(process.env.HAULZ_YANDEX_GEOSUGGEST_API_KEY || "").trim();
  return k || null;
}

export function getYandexGeosuggestApiKey(): string {
  const k = getYandexGeosuggestApiKeyOrNull();
  if (!k) throw new Error("HAULZ_YANDEX_GEOSUGGEST_API_KEY не задан");
  return k;
}

const CITY_BBOX: Record<"moscow" | "kaliningrad", string> = {
  moscow: "37.319,55.489~37.967,55.957",
  kaliningrad: "20.350,54.620~20.750,54.820",
};

const CITY_META: Record<"moscow" | "kaliningrad", { name: string }> = {
  moscow: { name: "Москва" },
  kaliningrad: { name: "Калининград" },
};

/** Нормализует ввод для Geosuggest (город + улица). */
export function prepareSuggestQuery(raw: string, city?: "moscow" | "kaliningrad"): string {
  let q = String(raw || "").trim().replace(/\s+/g, " ");
  if (!q || !city) return q;

  const meta = CITY_META[city];
  const stripped = q
    .replace(/^москва\s*[,]?\s*/i, "")
    .replace(/^калининград\s*[,]?\s*/i, "")
    .trim();

  if (stripped.length >= 2 && stripped !== q) return `${meta.name}, ${stripped}`;
  if (/^москва\s*[,]?\s*$/i.test(q) || /^калининград\s*[,]?\s*$/i.test(q)) return meta.name;
  if (!/москва|калининград/i.test(q) && stripped.length >= 2) return `${meta.name}, ${q}`;
  return q;
}

type YandexSuggestResponse = {
  results?: Array<{
    title?: { text?: string };
    subtitle?: { text?: string };
    address?: { formatted_address?: string };
    uri?: string;
    tags?: string[];
  }>;
  error?: string;
  message?: string;
};

function filterByCity(items: AddressSuggestItem[], city?: "moscow" | "kaliningrad"): AddressSuggestItem[] {
  const cityNeedle =
    city === "kaliningrad" ? "калининград" : city === "moscow" ? "москва" : null;
  if (!cityNeedle) return items;

  return items.filter((item) => {
    const lower = `${item.fullAddress} ${item.label}`.toLowerCase();
    if (cityNeedle === "москва") {
      if (lower.includes("калининград") || lower.includes("санкт-петербург")) return false;
      return true;
    }
    if (lower.includes("москва") || lower.includes("санкт-петербург")) return false;
    return true;
  });
}

function parseSuggestResponse(data: YandexSuggestResponse): AddressSuggestItem[] {
  const out: AddressSuggestItem[] = [];
  for (const row of data.results ?? []) {
    const fullAddress = String(row.address?.formatted_address ?? row.title?.text ?? "").trim();
    const label = String(row.title?.text ?? fullAddress).trim();
    if (!label && !fullAddress) continue;
    out.push({
      uri: row.uri,
      fullAddress: fullAddress || label,
      label,
    });
  }
  return out;
}

async function fetchGeosuggestOnce(
  text: string,
  opts: { city?: "moscow" | "kaliningrad"; useBbox?: boolean },
): Promise<AddressSuggestItem[]> {
  const apikey = getYandexGeosuggestApiKey();
  const params = new URLSearchParams({
    apikey,
    text,
    lang: "ru_RU",
    results: "10",
    print_address: "1",
    attrs: "uri",
    types: "geo",
    countries: "ru",
  });
  if (opts.city && opts.useBbox !== false) {
    params.set("bbox", CITY_BBOX[opts.city]);
    params.set("strict_bounds", "0");
  }

  const data = (await yandexFetchJson(
    `${YANDEX_SUGGEST_URL}?${params}`,
    undefined,
    10000,
  )) as YandexSuggestResponse;
  return parseSuggestResponse(data);
}

export async function yandexSuggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
): Promise<AddressSuggestItem[]> {
  const apikey = getYandexGeosuggestApiKeyOrNull();
  if (!apikey) return [];

  const text = prepareSuggestQuery(String(q || "").trim(), opts.city);
  if (text.length < 2) return [];

  let items = filterByCity(await fetchGeosuggestOnce(text, { ...opts, useBbox: true }), opts.city);
  if (items.length === 0 && opts.city) {
    items = filterByCity(await fetchGeosuggestOnce(text, { ...opts, useBbox: false }), opts.city);
  }
  const rawQuery = String(q || "").trim();
  if (items.length === 0 && text !== rawQuery) {
    items = filterByCity(await fetchGeosuggestOnce(rawQuery, { useBbox: false }), opts.city);
  }
  return items;
}
