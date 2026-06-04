import XLSX from "xlsx";
import type { CityCode, PickupTier } from "./types.js";

function parseNumCell(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseWeightMax(label: unknown): number {
  const s = String(label ?? "").toLowerCase().replace(/\s/g, "");
  const m = s.match(/до(\d+)/);
  if (m) return parseInt(m[1], 10);
  return parseNumCell(label);
}

function parseVolumeMax(label: unknown): number {
  const s = String(label ?? "").toLowerCase().replace(/\s/g, "");
  const m = s.match(/до([\d,.]+)/);
  if (m) return parseFloat(m[1].replace(",", "."));
  return parseNumCell(label);
}

type MatrixRows = (string | number)[][];

function buildTiersFromHeader(rows: MatrixRows, cityStartRow: number): PickupTier[] {
  const weightRow = rows[cityStartRow + 1];
  const volumeRow = rows[cityStartRow + 2];
  const cityFeeRow = rows[cityStartRow + 3];
  const perKmRow = rows[cityStartRow + 4];
  const loadRow = rows[cityStartRow + 5];
  const overtimeRow = rows[cityStartRow + 6];
  if (!weightRow || !volumeRow || !cityFeeRow || !perKmRow) return [];

  const tiers: PickupTier[] = [];
  for (let col = 2; col < weightRow.length; col++) {
    const wLabel = weightRow[col];
    const vLabel = volumeRow[col];
    const wMax = parseWeightMax(wLabel);
    const vMax = parseVolumeMax(vLabel);
    if (wMax <= 0 && vMax <= 0) continue;
    const tier: PickupTier = {
      weight_max_kg: wMax || 99999,
      volume_max_m3: vMax || 99999,
      city_fee: parseNumCell(cityFeeRow[col]),
      per_km: parseNumCell(perKmRow[col]),
    };
    const loadMin = parseNumCell(loadRow?.[col]);
    const overtime = parseNumCell(overtimeRow?.[col]);
    if (loadMin > 0) tier.load_minutes = loadMin;
    if (overtime > 0) tier.overtime_rub_per_hour = overtime;
    tiers.push(tier);
  }
  return tiers;
}

export function parsePickupXlsxFile(filePath: string): {
  moscow: PickupTier[];
  kaliningrad: PickupTier[];
  note?: string;
} | null {
  try {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
    }) as MatrixRows;
    const note = String(rows[0]?.[0] ?? "").trim() || undefined;
    const moscow = buildTiersFromHeader(rows, 0);
    const kaliningrad = buildTiersFromHeader(rows, 7);
    if (moscow.length === 0 && kaliningrad.length === 0) return null;
    return {
      moscow: moscow.length ? moscow : kaliningrad,
      kaliningrad: kaliningrad.length ? kaliningrad : moscow,
      note,
    };
  } catch {
    return null;
  }
}

export function parsePickupXlsxBuffer(buffer: Buffer): ReturnType<typeof parsePickupXlsxFile> {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
    }) as MatrixRows;
    const note = String(rows[0]?.[0] ?? "").trim() || undefined;
    const moscow = buildTiersFromHeader(rows, 0);
    const kaliningrad = buildTiersFromHeader(rows, 7);
    if (moscow.length === 0 && kaliningrad.length === 0) return null;
    return {
      moscow: moscow.length ? moscow : kaliningrad,
      kaliningrad: kaliningrad.length ? kaliningrad : moscow,
      note,
    };
  } catch {
    return null;
  }
}
