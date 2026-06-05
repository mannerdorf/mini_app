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

type SuggestScope = {
  locations: Record<string, string>[];
  locations_boost?: Record<string, string>[];
};

/** Москва — только город; Калининград — вся область, приоритет у г. Калининград. */
const SUGGEST_SCOPES: Record<"moscow" | "kaliningrad", SuggestScope> = {
  moscow: {
    locations: [{ city: "Москва" }],
    locations_boost: [{ city: "Москва" }],
  },
  kaliningrad: {
    locations: [{ region: "Калининградская" }],
    locations_boost: [{ city: "Калининград" }],
  },
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
    const scope = SUGGEST_SCOPES[opts.city];
    body.locations = scope.locations;
    if (scope.locations_boost?.length) {
      body.locations_boost = scope.locations_boost;
    }
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
