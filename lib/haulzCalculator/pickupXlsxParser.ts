import XLSX from "xlsx";
import type { PickupTier } from "./types.js";

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

/** Find rows by labels so additional distance bands do not shift city/load rows. */
export function parsePickupMatrixRows(rows: MatrixRows): {
  moscow: PickupTier[];
  kaliningrad: PickupTier[];
  note?: string;
} | null {
  const readCity = (cityName: string): PickupTier[] => {
    const cityIndex = rows.findIndex(row => /автоэкспедирование/i.test(String(row[0])) && String(row[0]).toLowerCase().includes(cityName));
    if (cityIndex < 0) return [];
    const headerStart = rows.slice(0, cityIndex).map(row => String(row[1])).lastIndexOf("Вес (кг)");
    if (headerStart < 0) return [];
    const nextHeader = rows.findIndex((row, index) => index > cityIndex && /вес.*кг/i.test(String(row[1])));
    const block = rows.slice(cityIndex, nextHeader < 0 ? undefined : nextHeader);
    const weightRow = rows[headerStart];
    const volumeRow = rows[headerStart + 1];
    const rateRows = block.filter(row => /выезд за пределы/i.test(String(row[0])));
    const loadRow = block.find(row => /^нормативное время/i.test(String(row[0])));
    const overtimeRow = block.find(row => /^сверхнормативное время/i.test(String(row[0])));
    if (!volumeRow || !rateRows.length || !loadRow || !overtimeRow) return [];
    const tiers: PickupTier[] = [];
    for (let col = 2; col < weightRow.length; col++) {
      const weight = parseWeightMax(weightRow[col]);
      const volume = parseVolumeMax(volumeRow[col]);
      if (weight <= 0 || volume <= 0) continue;
      const tier: PickupTier = {
        weight_max_kg: weight,
        volume_max_m3: volume,
        city_fee: parseNumCell(rows[cityIndex][col]),
        per_km: parseNumCell(rateRows[0][col]),
        load_minutes: parseNumCell(loadRow[col]),
        overtime_rub_per_hour: parseNumCell(overtimeRow[col]),
      };
      if (rateRows.length > 1) {
        tier.distance_rates = rateRows.map(row => {
          const label = String(row[0]);
          const range = label.match(/(\d+)\s*[-–—]\s*(\d+)\s*км/i);
          if (!range && !/от\s*\d+/i.test(label)) throw new Error('Неизвестный диапазон расстояния');
          return { max_km: range ? Number(range[2]) : null, per_km: parseNumCell(row[col]) };
        });
      }
      tiers.push(tier);
    }
    return tiers;
  };
  const moscow = readCity('москва');
  const kaliningrad = readCity('калининград');
  if (!moscow.length || !kaliningrad.length) return null;
  return { moscow, kaliningrad, note: String(rows[0]?.[0] ?? '').trim() || undefined };
}

function parseWorkbook(wb: XLSX.WorkBook): ReturnType<typeof parsePickupMatrixRows> {
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, defval: "" }) as MatrixRows;
    const parsed = parsePickupMatrixRows(rows);
    if (parsed) return parsed;
  }
  return null;
}

export function parsePickupXlsxFile(filePath: string): ReturnType<typeof parsePickupMatrixRows> {
  try { return parseWorkbook(XLSX.readFile(filePath)); } catch { return null; }
}

export function parsePickupXlsxBuffer(buffer: Buffer): ReturnType<typeof parsePickupMatrixRows> {
  try { return parseWorkbook(XLSX.read(buffer, { type: "buffer" })); } catch { return null; }
}
