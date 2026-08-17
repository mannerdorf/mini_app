import type { Pool } from "pg";
import { cityToCode } from "../cityToCode.js";
import type { Direction, MainlineMode } from "./types.js";
import type { TariffBasis } from "./tariffBasisFootnote.js";
import { formatTariffBasisFootnote } from "./tariffBasisFootnote.js";

export type ClientMainlineTariffRow = {
  docNumber: string;
  docDate: string | null;
  tariff: number;
  transportType: string;
};

type CacheTariffRow = {
  doc_number: string;
  doc_date: string | null;
  tariff: string | number | null;
  transport_type: string;
  city_from: string;
  city_to: string;
};

function normalizeInnDigits(inn: string): string {
  return String(inn || "").replace(/\D/g, "").trim();
}

export function directionCityCodes(direction: Direction): { from: string; to: string } {
  return direction === "mow_kgd" ? { from: "MSK", to: "KGD" } : { from: "KGD", to: "MSK" };
}

export function transportTypeToMainlineMode(transportType: string): MainlineMode | null {
  const t = String(transportType || "").trim().toLowerCase();
  if (!t) return null;
  // Авиа до авто: «авиа» не должна пересекаться с эвристиками авто.
  if (t.includes("авиа") || t.includes("air") || t.includes("самол")) return "air";
  if (t.includes("паром") || t.includes("ferry") || t.includes("морск") || t === "море") return "ferry";
  if (t.includes("авто") || t.includes("auto") || t.includes("автомоб")) return "auto";
  return null;
}

function rowMatchesDirection(row: CacheTariffRow, direction: Direction): boolean {
  const route = directionCityCodes(direction);
  return cityToCode(row.city_from) === route.from && cityToCode(row.city_to) === route.to;
}

function mapTariffRow(row: CacheTariffRow): ClientMainlineTariffRow | null {
  const tariff = Number(row.tariff);
  const docNumber = String(row.doc_number || "").trim();
  if (!docNumber || !Number.isFinite(tariff) || tariff <= 0) return null;
  return {
    docNumber,
    docDate: row.doc_date ? String(row.doc_date) : null,
    tariff,
    transportType: String(row.transport_type || "").trim(),
  };
}

export async function loadClientMainlineTariffsByMode(
  pool: Pool,
  innRaw: string,
  direction: Direction,
): Promise<Partial<Record<MainlineMode, ClientMainlineTariffRow>>> {
  const inn = normalizeInnDigits(innRaw);
  if (!inn) return {};

  try {
    const { rows } = await pool.query<CacheTariffRow>(
      `select doc_number, doc_date, tariff, transport_type, city_from, city_to
       from cache_tariffs
       where customer_inn = $1
         and is_dangerous = false
         and is_vet = false
         and tariff is not null
         and nullif(trim(doc_number), '') is not null
       order by doc_date desc nulls last, id desc`,
      [inn],
    );

    const out: Partial<Record<MainlineMode, ClientMainlineTariffRow>> = {};
    for (const row of rows) {
      if (!rowMatchesDirection(row, direction)) continue;
      const mapped = mapTariffRow(row);
      if (!mapped) continue;
      const mode = transportTypeToMainlineMode(mapped.transportType);
      if (!mode || out[mode]) continue;
      out[mode] = mapped;
    }
    return out;
  } catch {
    return {};
  }
}

export async function resolveClientMainlineTariff(
  pool: Pool,
  innRaw: string,
  direction: Direction,
  mode: MainlineMode,
): Promise<ClientMainlineTariffRow | null> {
  const byMode = await loadClientMainlineTariffsByMode(pool, innRaw, direction);
  return byMode[mode] ?? null;
}

export function buildTariffBasis(
  clientTariff: ClientMainlineTariffRow,
  contractNumber: string,
  contractDate: string | null | undefined,
): TariffBasis {
  return {
    tariffNumber: clientTariff.docNumber,
    tariffDate: clientTariff.docDate,
    contractNumber: String(contractNumber || "").trim(),
    contractDate: contractDate ? String(contractDate) : null,
    pricePerKg: clientTariff.tariff,
  };
}

export function buildTariffBasisFootnote(
  clientTariff: ClientMainlineTariffRow,
  contractNumber: string,
  contractDate: string | null | undefined,
): string | null {
  return formatTariffBasisFootnote(buildTariffBasis(clientTariff, contractNumber, contractDate));
}
