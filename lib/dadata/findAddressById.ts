import { getDadataApiKey } from "./findPartyByInn.js";
import type { DadataAddressSuggestion } from "./suggestAddress.js";
import { dadataAddressFromSuggestion } from "./suggestAddress.js";

const DADATA_FIND_BY_ID_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/address";

/** Точные координаты и адрес по FIAS/GAR id (из подсказки DaData). */
export async function dadataFindAddressByFiasId(
  fiasId: string,
): Promise<ReturnType<typeof dadataAddressFromSuggestion>> {
  const id = String(fiasId || "").trim();
  if (!id) return null;

  const apiKey = getDadataApiKey();
  const res = await fetch(DADATA_FIND_BY_ID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ query: id }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    suggestions?: DadataAddressSuggestion[];
    message?: string;
  };

  if (!res.ok) {
    const msg = data.message || `DaData HTTP ${res.status}`;
    throw new Error(msg);
  }

  const row = data.suggestions?.[0];
  return row ? dadataAddressFromSuggestion(row) : null;
}
