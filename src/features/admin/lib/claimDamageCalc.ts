import { extractNomenclatureFromPerevozka } from "../../../lib/perevozkaDetails";

export function normalizePlaceKey(value: unknown): string {
  return String(value ?? "").trim().replace(/s+/g, "").toLowerCase();
}

export function extractPlaceNumberFromLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/(d[d-]*d|d+)/);
  return match ? match[1] : raw;
}

export function extractPerevozkaNomenclatureRows(data: unknown): Record<string, unknown>[] {
  return extractNomenclatureFromPerevozka(data);
}

export function pickFirstNumericField(obj: unknown, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (raw == null || raw === "") continue;
    const n = Number(String(raw).replace(/s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
