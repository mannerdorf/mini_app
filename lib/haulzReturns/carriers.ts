export type HaulzCarrier = {
  id: string;
  name: string;
  legalAddress: string;
  inn: string;
  kpp: string;
  loadingAddress: string;
  unloadingAddress: string;
  createdAt: string;
  updatedAt: string;
};

export type HaulzCarrierInput = {
  name: string;
  legalAddress: string;
  inn: string;
  kpp: string;
  loadingAddress: string;
  unloadingAddress: string;
};

export function formatCarrierInnKpp(inn: string, kpp: string): string {
  const i = inn.trim();
  const k = kpp.trim();
  if (i && k) return `${i} / ${k}`;
  return i || k;
}

export function formatCarrierCard(c: Pick<HaulzCarrier, "name" | "legalAddress" | "inn" | "kpp" | "loadingAddress" | "unloadingAddress">): string {
  const lines = [c.name.trim()];
  if (c.legalAddress.trim()) lines.push(c.legalAddress.trim());
  const innKpp = formatCarrierInnKpp(c.inn, c.kpp);
  if (innKpp) lines.push(`ИНН / КПП: ${innKpp}`);
  if (c.loadingAddress.trim()) lines.push(`Факт. адрес загрузки: ${c.loadingAddress.trim()}`);
  if (c.unloadingAddress.trim()) lines.push(`Факт. адрес выгрузки: ${c.unloadingAddress.trim()}`);
  return lines.join("\n");
}

export function parseCarrierInput(body: unknown): HaulzCarrierInput | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) return null;
  return {
    name,
    legalAddress: String(o.legalAddress ?? o.legal_address ?? "").trim(),
    inn: String(o.inn ?? "").trim(),
    kpp: String(o.kpp ?? "").trim(),
    loadingAddress: String(o.loadingAddress ?? o.loading_address ?? "").trim(),
    unloadingAddress: String(o.unloadingAddress ?? o.unloading_address ?? "").trim(),
  };
}

export function carrierFromDbRow(row: {
  id: string;
  name: string;
  legal_address: string;
  inn: string;
  kpp: string;
  loading_address: string;
  unloading_address: string;
  created_at: string;
  updated_at: string;
}): HaulzCarrier {
  return {
    id: row.id,
    name: row.name,
    legalAddress: row.legal_address,
    inn: row.inn,
    kpp: row.kpp,
    loadingAddress: row.loading_address,
    unloadingAddress: row.unloading_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
