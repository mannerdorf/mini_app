import * as XLSX from "xlsx";
import type { FivepostParsedRow, FivepostRoute } from "./types.js";

const COLUMN_ALIASES: Record<keyof Omit<FivepostParsedRow, never>, string[]> = {
  clientOrderNo: ["номер заказа клиента"],
  partnerOrderNo: ["номер заказа партнера", "номер заказа партнёра"],
  teBarcode: ["шк те", "шк тe"],
  placesCount: ["количество мест"],
  omniBarcode: ["шк omni грузового места", "шк омни грузового места"],
  itemName: ["артикул вложения", "название"],
  unitCost: ["стоимость вложения"],
  totalCost: ["стоимость общая"],
  weightG: ["вес заказа физический", "вес заказа"],
  lengthMm: ["длина грузового места"],
  widthMm: ["ширина грузового места"],
  heightMm: ["высота грузового места"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIntPlaces(value: unknown): number {
  const n = parseNumber(value);
  if (n == null) return 1;
  return Math.max(1, Math.round(n));
}

function findHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] as unknown[] | undefined;
    if (!row?.length) continue;
    const joined = row.map(normalizeHeader).join("|");
    if (joined.includes("номер заказа") && joined.includes("артикул")) return i;
  }
  return 0;
}

function mapHeaders(headerRow: unknown[]): Partial<Record<keyof FivepostParsedRow, number>> {
  const map: Partial<Record<keyof FivepostParsedRow, number>> = {};
  for (let col = 0; col < headerRow.length; col++) {
    const cell = normalizeHeader(headerRow[col]);
    if (!cell) continue;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof FivepostParsedRow, string[]][]) {
      if (map[field] != null) continue;
      if (aliases.some((alias) => cell.includes(alias))) {
        map[field] = col;
      }
    }
  }
  return map;
}

function inferRouteFromFilename(filename: string): FivepostRoute {
  const lower = filename.toLowerCase();
  if (lower.includes("калининград") || lower.includes("kgd")) return "kgd_mow";
  if (lower.includes("москв") || lower.includes("mow") || lower.includes("msk")) return "mow_kgd";
  return "kgd_mow";
}

export function parseFivepostShipmentBuffer(
  buffer: Buffer | Uint8Array,
  filename = "",
): { rows: FivepostParsedRow[]; route: FivepostRoute } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const wb = XLSX.read(bytes, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Лист Excel не найден");

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!data.length) throw new Error("Файл пустой");

  const headerIdx = findHeaderRow(data);
  const headerMap = mapHeaders(data[headerIdx] as unknown[]);
  if (headerMap.itemName == null) {
    throw new Error("Не найдена колонка «Артикул вложения (название)»");
  }

  const rows: FivepostParsedRow[] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[] | undefined;
    if (!row?.length) continue;

    const read = (field: keyof FivepostParsedRow) => {
      const col = headerMap[field];
      return col == null ? "" : row[col];
    };

    const itemName = String(read("itemName") ?? "").replace(/\s+/g, " ").trim();
    const clientOrderNo = String(read("clientOrderNo") ?? "").trim();
    const partnerOrderNo = String(read("partnerOrderNo") ?? "").trim();
    if (!itemName && !clientOrderNo && !partnerOrderNo) continue;
    if (/^итого$/i.test(clientOrderNo) || /^итого$/i.test(itemName)) continue;

    rows.push({
      clientOrderNo,
      partnerOrderNo,
      teBarcode: String(read("teBarcode") ?? "").trim(),
      placesCount: parseIntPlaces(read("placesCount")),
      omniBarcode: String(read("omniBarcode") ?? "").trim(),
      itemName,
      unitCost: parseNumber(read("unitCost")),
      totalCost: parseNumber(read("totalCost")),
      weightG: parseNumber(read("weightG")),
      lengthMm: parseNumber(read("lengthMm")),
      widthMm: parseNumber(read("widthMm")),
      heightMm: parseNumber(read("heightMm")),
    });
  }

  if (!rows.length) throw new Error("В файле не найдено строк отгрузки");

  return { rows, route: inferRouteFromFilename(filename) };
}

export function parseFivepostShipmentFile(file: File): Promise<{ rows: FivepostParsedRow[]; route: FivepostRoute }> {
  return file.arrayBuffer().then((buf) => parseFivepostShipmentBuffer(new Uint8Array(buf), file.name));
}
