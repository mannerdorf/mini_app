const DADATA_PARTY_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";

export function getDadataApiKey(): string {
  const k = String(process.env.DADATA_API_KEY || "").trim();
  if (!k) throw new Error("DADATA_API_KEY не задан");
  return k;
}

export function normalizeInn(raw: string): string {
  return String(raw || "").replace(/\D/g, "").trim();
}

export function isValidInn(inn: string): boolean {
  return inn.length === 10 || inn.length === 12;
}

type DadataPartyName = {
  full_with_opf?: string | null;
  short_with_opf?: string | null;
  full?: string | null;
  short?: string | null;
};

type DadataPartyData = {
  inn?: string;
  kpp?: string;
  ogrn?: string;
  type?: "LEGAL" | "INDIVIDUAL";
  name?: DadataPartyName;
  fio?: { surname?: string; name?: string; patronymic?: string };
  state?: { status?: string };
};

type DadataPartyResponse = {
  suggestions?: Array<{
    value?: string;
    data?: DadataPartyData;
  }>;
};

export type PartyByInnResult = {
  inn: string;
  kpp?: string;
  ogrn?: string;
  type: "LEGAL" | "INDIVIDUAL";
  fullName: string;
  shortName?: string;
  status?: string;
};

export function partyFullNameFromData(data: DadataPartyData, fallbackValue?: string): string {
  const name = data.name;
  if (data.type === "INDIVIDUAL") {
    const fromName = String(name?.full || name?.full_with_opf || "").trim();
    if (fromName) return fromName;
    const fio = data.fio;
    if (fio) {
      const parts = [fio.surname, fio.name, fio.patronymic].map((p) => String(p || "").trim()).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
  }
  const legal =
    String(name?.full_with_opf || name?.full || name?.short_with_opf || name?.short || "").trim();
  if (legal) return legal;
  return String(fallbackValue || "").trim();
}

export async function findPartyByInn(innRaw: string): Promise<PartyByInnResult | null> {
  const inn = normalizeInn(innRaw);
  if (!isValidInn(inn)) return null;

  const apiKey = getDadataApiKey();
  const res = await fetch(DADATA_PARTY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ query: inn }),
  });

  const data = (await res.json().catch(() => ({}))) as DadataPartyResponse & {
    message?: string;
    family?: string;
  };

  if (!res.ok) {
    const msg = data.message || data.family || `DaData HTTP ${res.status}`;
    throw new Error(msg);
  }

  const row = data.suggestions?.[0];
  if (!row?.data) return null;

  const party = row.data;
  const fullName = partyFullNameFromData(party, row.value);
  if (!fullName) return null;

  const type: "LEGAL" | "INDIVIDUAL" = party.type === "INDIVIDUAL" ? "INDIVIDUAL" : "LEGAL";

  return {
    inn: String(party.inn || inn),
    kpp: party.kpp ? String(party.kpp) : undefined,
    ogrn: party.ogrn ? String(party.ogrn) : undefined,
    type,
    fullName,
    shortName: String(party.name?.short_with_opf || party.name?.short || "").trim() || undefined,
    status: party.state?.status ? String(party.state.status) : undefined,
  };
}
