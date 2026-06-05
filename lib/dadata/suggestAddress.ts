import { getDadataApiKey } from "./findPartyByInn.js";

const DADATA_SUGGEST_ADDRESS_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

export type DadataAddressSuggestion = {
  value?: string;
  unrestricted_value?: string;
  data?: {
    fias_id?: string;
    kladr_id?: string;
    city?: string;
    street?: string;
    house?: string;
    block?: string;
    flat?: string;
    settlement?: string;
    region?: string;
  };
};

type DadataSuggestResponse = {
  suggestions?: DadataAddressSuggestion[];
  message?: string;
  family?: string;
};

export type DadataSuggestItem = {
  id?: string;
  fullAddress: string;
  label: string;
};

const CITY_LOCATIONS: Record<"moscow" | "kaliningrad", Record<string, string>[]> = {
  moscow: [{ city: "Москва" }],
  kaliningrad: [{ city: "Калининград" }],
};

function labelFromSuggestion(row: DadataAddressSuggestion): string {
  const data = row.data;
  const parts = [data?.street, data?.house, data?.block, data?.flat]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  return String(row.value || row.unrestricted_value || "").trim();
}

export function normalizeDadataSuggestResponse(data: unknown): DadataSuggestItem[] {
  const rows = (data as DadataSuggestResponse)?.suggestions;
  if (!Array.isArray(rows)) return [];

  const out: DadataSuggestItem[] = [];
  for (const row of rows) {
    const fullAddress = String(row.unrestricted_value || row.value || "").trim();
    const label = labelFromSuggestion(row);
    if (!fullAddress && !label) continue;
    out.push({
      id: row.data?.fias_id || row.data?.kladr_id || undefined,
      fullAddress: fullAddress || label,
      label: label || fullAddress,
    });
  }
  return out;
}

export async function dadataSuggestAddresses(
  q: string,
  opts: { city?: "moscow" | "kaliningrad" },
): Promise<DadataSuggestItem[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const apiKey = getDadataApiKey();
  const body: Record<string, unknown> = {
    query,
    count: 10,
  };
  if (opts.city) {
    const loc = CITY_LOCATIONS[opts.city];
    body.locations = loc;
    body.locations_boost = loc;
  }

  const res = await fetch(DADATA_SUGGEST_ADDRESS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as DadataSuggestResponse;
  if (!res.ok) {
    const msg = data.message || data.family || `DaData HTTP ${res.status}`;
    throw new Error(msg);
  }

  return normalizeDadataSuggestResponse(data);
}
