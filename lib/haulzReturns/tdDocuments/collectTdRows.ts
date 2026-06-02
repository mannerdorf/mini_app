import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "../types.js";
import { FIX_DEFAULT_SORT, sortDataRows } from "../rowSort.js";
import { isSummaryRow, isUlRowInItog, stripSummaryRows } from "../ulTotals.js";

export type FixTdRow = {
  num: number;
  ul: string;
  line: string;
  id: string;
  parcel: string;
  name: string;
  qty: string | number;
  weight: string | number;
  cost: string | number;
  tdNumber: string;
  seal: string;
};

export type UlWriteoffRow = {
  num: number;
  ulNumber: string;
  rowNum: string;
  line: string;
  id: string;
  parcel: string;
  airport: string;
  weight: string | number;
  volume: string | number;
  category: string;
  name: string;
  qty: string | number;
  cost: string | number;
};

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Ключ УЛ для сопоставления «02606521» и «2606521». */
export function normalizeUlKey(ul: unknown): string {
  const s = cellStr(ul);
  if (!s) return "";
  const stripped = s.replace(/^0+/, "");
  return stripped || "0";
}

function parseUlNumber(sheetId: string): string | null {
  if (!sheetId.startsWith("ul-")) return null;
  const n = sheetId.slice(3).trim();
  return n || null;
}

export function ulTdNumberMap(workbook: HaulzWorkbook): Map<string, string> {
  const map = new Map<string, string>();
  for (const sheet of workbook.sheets) {
    const ul = parseUlNumber(sheet.id);
    if (!ul) continue;
    const td = cellStr(sheet.tdNumber);
    map.set(normalizeUlKey(ul), td);
    map.set(ul, td);
  }
  return map;
}

export function collectFixRows(workbook: HaulzWorkbook): FixTdRow[] {
  const fix = workbook.sheets.find((s) => s.id === "fix");
  if (!fix) return [];
  const tdByUl = ulTdNumberMap(workbook);
  const rows = sortDataRows(stripSummaryRows(fix.rows), FIX_DEFAULT_SORT);
  return rows.map((r, idx) => ({
    num: idx + 1,
    ul: cellStr(r.ul),
    line: cellStr(r.line),
    id: cellStr(r.id),
    parcel: cellStr(r.parcel),
    name: cellStr(r.translate) || cellStr(r.ulData),
    qty: r.qty ?? "",
    weight: r.weight ?? "",
    cost: r.cost ?? "",
    tdNumber:
      tdByUl.get(normalizeUlKey(r.ul)) ??
      tdByUl.get(cellStr(r.ul)) ??
      cellStr(r.tdNumber),
    seal: cellStr(r.seal),
  }));
}

export function collectWriteoffRowsForUl(sheet: HaulzSheet, ulNumber: string): UlWriteoffRow[] {
  const dataRows = stripSummaryRows(sheet.rows).filter(isUlRowInItog);
  const sorted = sortDataRows(dataRows, [{ key: "rowNum", dir: "asc" }]);
  return sorted.map((r, idx) => ({
    num: idx + 1,
    ulNumber,
    rowNum: cellStr(r.rowNum),
    line: cellStr(r.rowNum),
    id: cellStr(r.cargoPlace),
    parcel: cellStr(r.parcel),
    airport: cellStr(r.airport),
    weight: r.weight ?? "",
    volume: r.volume ?? "",
    category: cellStr(r.category) || "<>",
    name: cellStr(r.name),
    qty: r.qty ?? "",
    cost: r.cost ?? "",
  }));
}

export function ulSheetsWithInItog(workbook: HaulzWorkbook): Array<{ sheet: HaulzSheet; ulNumber: string }> {
  const out: Array<{ sheet: HaulzSheet; ulNumber: string }> = [];
  for (const sheet of workbook.sheets) {
    const ul = parseUlNumber(sheet.id);
    if (!ul) continue;
    const hasInItog = stripSummaryRows(sheet.rows).some(isUlRowInItog);
    if (hasInItog) out.push({ sheet, ulNumber: ul });
  }
  return out.sort((a, b) => a.ulNumber.localeCompare(b.ulNumber, "ru", { numeric: true }));
}

export function validateTdPrep(workbook: HaulzWorkbook): string[] {
  const errors: string[] = [];
  const fix = workbook.sheets.find((s) => s.id === "fix");
  if (!fix || stripSummaryRows(fix.rows).length === 0) {
    errors.push("Создайте лист FIX (кнопка «Создать FIX» на вкладке итог).");
  }
  for (const { sheet, ulNumber } of ulSheetsWithInItog(workbook)) {
    if (!cellStr(sheet.tdNumber)) {
      errors.push(`Укажите номер ТД для УЛ ${ulNumber}.`);
    }
  }
  return errors;
}

export function isSummaryRowSafe(row: HaulzSheetRow): boolean {
  return isSummaryRow(row);
}
