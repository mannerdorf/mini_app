import * as XLSX from "xlsx";
import { normalizeWbPerevozkaHaulzDigits } from "../lib/wbPerevozkaDigits.js";
import { parseCellDateFlexible } from "./_excelMeta.js";

export type WbLogisticsParsedRow = {
  parcelKey: string;
  perevozkaNasha: string;
  otchetDostavki: string;
  otpavkaAp: string;
  stoimost: string;
  logisticsStatus: string;
  dataDoc: string;
  dataInfoReceived: string;
  dataPacked: string;
  dataConsolidated: string;
  dataSentAirport: string;
  dataDeparted: string;
  dataToHand: string;
  dataDelivered: string;
};

type ColIdx = {
  parcel: number;
  perevozkaNasha: number;
  otchet: number;
  ap: number;
  stoim: number;
  status: number;
  dataDoc: number;
  dataInfo: number;
  dataPack: number;
  dataCons: number;
  dataAir: number;
  dataFly: number;
  dataHand: number;
  dataDeliv: number;
};

function asText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeHeaderCell(v: unknown) {
  return asText(v).toLowerCase().replace(/\s+/g, " ");
}

/** Строка в ячейку для БД: даты Excel → YYYY-MM-DD, целые без .0 */
export function logisticsCellToText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    const t = v.getTime();
    if (Number.isNaN(t)) return "";
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = parseCellDateFlexible(v);
    if (d) return d;
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (typeof v === "bigint") return v.toString();
  const s = String(v).trim();
  const d2 = parseCellDateFlexible(s);
  if (d2) return d2;
  return s;
}

function findHeaderRowIndex(data: unknown[][]) {
  for (let i = 0; i < Math.min(50, data.length); i++) {
    const row = data[i] ?? [];
    for (const cell of row) {
      const n = normalizeHeaderCell(cell);
      if (n.includes("посылк")) return i;
    }
  }
  return -1;
}

function buildColumnIndexes(headerRow: unknown[]): ColIdx | null {
  const cells = headerRow.map((raw, i) => ({
    i,
    n: normalizeHeaderCell(raw),
    raw,
  }));

  const by = (pred: (n: string) => boolean) => cells.find((c) => pred(c.n))?.i ?? -1;

  const parcel = by((n) => n.includes("посылк"));
  if (parcel < 0) return null;

  const otchet = by((n) => n.includes("отчет") && n.includes("доставк"));
  const ap = by((n) => n.includes("отправк") && (n.includes("ап") || n.includes(" ап")));
  const stoim = by((n) => n === "стоимость" || (n.startsWith("стоимость") && !n.includes("озон")));
  const status = by((n) => n === "статус" || (n.startsWith("статус") && !n.includes("озон")));

  const dataInfo = by((n) => n.includes("получен") && n.includes("информ"));
  const dataPack = by((n) => n.includes("упаков"));
  const dataCons = by((n) => n.includes("консолид"));
  const dataAir = by((n) => n.includes("аэропорт"));
  const dataFly = by((n) => n.includes("улетел"));
  const dataHand = by((n) => n.includes("вручен"));
  const dataDeliv = by((n) => n.includes("доставлен"));

  const dataDoc = by((n) => n === "дата");

  let perevozkaNasha = by((n) => n.includes("перевозка") && n.includes("наша"));
  const perevoz = by((n) => n === "перевозка" || (n.startsWith("перевозка") && !n.includes("наша") && !n.includes("озон")));

  if (perevozkaNasha < 0 && perevoz >= 0 && otchet >= 0 && otchet === perevoz + 2) {
    perevozkaNasha = perevoz + 1;
  }
  if (perevozkaNasha < 0 && perevoz >= 0 && otchet >= 0) {
    const mid = cells.find((c) => c.i === perevoz + 1);
    if (mid && typeof mid.raw === "number") perevozkaNasha = perevoz + 1;
  }

  return {
    parcel,
    perevozkaNasha: perevozkaNasha >= 0 ? perevozkaNasha : -1,
    otchet,
    ap,
    stoim,
    status,
    dataDoc,
    dataInfo,
    dataPack,
    dataCons,
    dataAir,
    dataFly,
    dataHand,
    dataDeliv,
  };
}

function pick(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  return logisticsCellToText(row[idx]);
}

/**
 * Колонка «Перевозка наша»: Excel отдаёт число → теряются ведущие нули.
 * Даты в этой колонке (редко) обрабатываем как в logisticsCellToText.
 */
function perevozkaNashaCellToText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return logisticsCellToText(v);
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = parseCellDateFlexible(v);
    if (d) return d;
    if (!Number.isInteger(v)) return logisticsCellToText(v);
    const s = String(Math.trunc(v));
    if (!/^\d+$/.test(s)) return logisticsCellToText(v);
    return normalizeWbPerevozkaHaulzDigits(s);
  }
  if (typeof v === "bigint") {
    const s = v.toString();
    if (!/^\d+$/.test(s)) return s;
    return normalizeWbPerevozkaHaulzDigits(s);
  }
  const s0 = String(v).trim();
  const d2 = parseCellDateFlexible(s0);
  if (d2) return d2;
  if (/^\d+$/.test(s0)) return normalizeWbPerevozkaHaulzDigits(s0);
  return s0;
}

export function parseLogisticsWorksheet(ws: XLSX.WorkSheet): WbLogisticsParsedRow[] {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
  if (!data.length) return [];

  const headerRowIdx = findHeaderRowIndex(data);
  if (headerRowIdx < 0) return [];

  const col = buildColumnIndexes(data[headerRowIdx] ?? []);
  if (!col || col.parcel < 0) return [];

  const out: WbLogisticsParsedRow[] = [];
  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r] ?? [];
    const parcelKey = asText(row[col.parcel]);
    if (!parcelKey) continue;

    out.push({
      parcelKey,
      perevozkaNasha: perevozkaNashaCellToText(row[col.perevozkaNasha]),
      otchetDostavki: pick(row, col.otchet),
      otpavkaAp: pick(row, col.ap),
      stoimost: pick(row, col.stoim),
      logisticsStatus: pick(row, col.status),
      dataDoc: pick(row, col.dataDoc),
      dataInfoReceived: pick(row, col.dataInfo),
      dataPacked: pick(row, col.dataPack),
      dataConsolidated: pick(row, col.dataCons),
      dataSentAirport: pick(row, col.dataAir),
      dataDeparted: pick(row, col.dataFly),
      dataToHand: pick(row, col.dataHand),
      dataDelivered: pick(row, col.dataDeliv),
    });
  }
  return out;
}
