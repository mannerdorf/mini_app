import type { AddressSuggestItem } from "./yandexClient.js";

const YANDEX_SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";

/** API Геосаджеста — подсказки при вводе адреса. */
export function getYandexGeosuggestApiKey(): string {
  const k = String(process.env.HAULZ_YANDEX_GEOSUGGEST_API_KEY || "").trim();
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
};

export async function yandexSuggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
): Promise<AddressSuggestItem[]> {
  const apikey = getYandexGeosuggestApiKey();
  const text = prepareSuggestQuery(String(q || "").trim(), opts.city);
  if (text.length < 2) return [];

  const params = new URLSearchParams({
    apikey,
    text,
    lang: "ru_RU",
    results: "10",
    print_address: "1",
    attrs: "uri",
    types: "house,street",
    countries: "ru",
  });
  if (opts.city) {
    params.set("bbox", CITY_BBOX[opts.city]);
    params.set("strict_bounds", "0");
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${YANDEX_SUGGEST_URL}?${params}`, { signal: ctrl.signal });
    const data = (await res.json().catch(() => ({}))) as YandexSuggestResponse;
    if (!res.ok) return [];

    const cityNeedle =
      opts.city === "kaliningrad" ? "калининград" : opts.city === "moscow" ? "москва" : null;

    const out: AddressSuggestItem[] = [];
    for (const row of data.results ?? []) {
      const fullAddress = String(row.address?.formatted_address ?? row.title?.text ?? "").trim();
      const label = String(row.title?.text ?? fullAddress).trim();
      if (!label && !fullAddress) continue;

      const lower = `${fullAddress} ${label}`.toLowerCase();
      if (cityNeedle === "москва" && (lower.includes("калининград") || lower.includes("санкт-петербург"))) {
        continue;
      }
      if (cityNeedle === "калининград" && (lower.includes("москва") || lower.includes("санкт-петербург"))) {
        continue;
      }

      out.push({
        uri: row.uri,
        fullAddress: fullAddress || label,
        label,
      });
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}
