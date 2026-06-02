import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { itogControlKey } from "./itogRowKeys.js";
import { stopColumnValue } from "./validators.js";

export type UlTotals = {
  weight: number;
  volume: number;
  placeCount: number;
  cost: number;
};

export type ItogTotals = {
  placeCount: number;
  weight: number;
  cost: number;
};

export type KgdTotals = {
  placeCount: number;
};

export function isSummaryRow(row: HaulzSheetRow): boolean {
  return Boolean(row._isSummary);
}

/** @deprecated use isSummaryRow */
export const isUlSummaryRow = isSummaryRow;

export function stripSummaryRows(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  return rows.filter((r) => !isSummaryRow(r));
}

export function isUlRowInItog(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return false;
  const v = row.inItog;
  if (v === true || v === 1) return true;
  return String(v ?? "").trim() === "1";
}

/** Номера УЛ, у которых есть хотя бы одна строка на листе «итог». */
export function collectUlNumbersInItog(workbook: { sheets: { id: string; rows: HaulzSheetRow[] }[] }): Set<string> {
  const itog = workbook.sheets.find((s) => s.id === "itog");
  if (!itog) return new Set();
  const out = new Set<string>();
  for (const row of stripSummaryRows(itog.rows)) {
    const ul = String(row.ul ?? "").trim();
    if (ul) out.add(ul);
  }
  return out;
}

export function isUlTabInItog(tabId: string, ulNumbersInItog: Set<string>): boolean {
  if (!tabId.startsWith("ul-")) return false;
  return ulNumbersInItog.has(tabId.slice(3));
}

export function ulControlKey(row: HaulzSheetRow, ulNumber: string): string {
  const mark = String(row.mark ?? ulNumber);
  return `${mark}${row.rowNum ?? ""}${row.parcel ?? ""}`;
}

/** Строка УЛ с данными: есть грузовое место или номер посылки (не только «Номер п/п»). */
export function isUlDataRowFilled(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return false;
  return Boolean(String(row.parcel ?? "").trim() || String(row.cargoPlace ?? "").trim());
}

export function isItogDataRowFilled(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return false;
  return Boolean(String(row.parcel ?? "").trim());
}

export function isKgdDataRowFilled(row: HaulzSheetRow): boolean {
  return isItogDataRowFilled(row);
}

export function countUlDataRows(rows: HaulzSheetRow[]): number {
  return rows.filter(isUlDataRowFilled).length;
}

export function countItogDataRows(rows: HaulzSheetRow[]): number {
  return rows.filter(isItogDataRowFilled).length;
}

export function countKgdDataRows(rows: HaulzSheetRow[]): number {
  return rows.filter(isKgdDataRowFilled).length;
}

export function countSheetDataRows(sheet: HaulzSheet): number {
  if (sheet.id === "itog") return countItogDataRows(sheet.rows);
  if (sheet.id === "kgd") return countKgdDataRows(sheet.rows);
  if (sheet.id.startsWith("ul-")) return countUlDataRows(sheet.rows);
  return stripSummaryRows(sheet.rows).length;
}

export function syncUlSheetFromControlKeys(sheet: HaulzSheet, controlKeys: Set<string>): HaulzSheet {
  if (!sheet.id.startsWith("ul-") || sheet.ulDeferred) return sheet;
  const ulNumber = sheet.id.slice(3);
  const dataRows = stripSummaryRows(sheet.rows).map((row) => {
    const key = ulControlKey(row, ulNumber);
    return { ...row, mark: row.mark ?? ulNumber, inItog: controlKeys.has(key) ? 1 : 0 };
  });
  return { ...sheet, rows: dataRows.length ? appendUlSummaryRow(dataRows) : sheet.rows };
}

/** Проставляет «В итоге» на всех уже загруженных листах УЛ. */
export function syncAllUlSheetsFromControlKeys(workbook: {
  sheets: HaulzSheet[];
  itogControlKeys: Set<string>;
}): HaulzWorkbook {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) =>
      sheet.id.startsWith("ul-") ? syncUlSheetFromControlKeys(sheet, workbook.itogControlKeys) : sheet,
    ),
  };
}

/** УЛ с строками в итоге — по листу «итог» или по itogControlKeys (если УЛ ещё не загружен). */
export function ulNumbersWithInItog(workbook: {
  sheets: { id: string; rows: HaulzSheetRow[] }[];
  itogControlKeys?: Set<string>;
  excludedUlNumbers?: Set<string>;
}): Set<string> {
  const fromItog = collectUlNumbersInItog(workbook);
  if (fromItog.size > 0) return fromItog;

  const out = new Set<string>();
  const keys = workbook.itogControlKeys ?? new Set<string>();
  for (const sheet of workbook.sheets) {
    if (!sheet.id.startsWith("ul-")) continue;
    const ulNumber = sheet.id.slice(3);
    if (workbook.excludedUlNumbers?.has(ulNumber)) continue;
    for (const key of keys) {
      if (key.startsWith(ulNumber)) {
        out.add(ulNumber);
        break;
      }
    }
  }
  return out;
}

export function isUlRowInItogForWorkbook(
  row: HaulzSheetRow,
  ulNumber: string,
  controlKeys: Set<string>,
): boolean {
  if (isUlRowInItog(row)) return true;
  if (isSummaryRow(row) || controlKeys.size === 0) return false;
  return controlKeys.has(ulControlKey(row, ulNumber));
}

export function ulSheetNeedsHydration(
  sheet: HaulzSheet,
  ulNumbersInItog: Set<string>,
): boolean {
  if (!sheet.id.startsWith("ul-")) return false;
  const ulNumber = sheet.id.slice(3);
  if (!ulNumbersInItog.has(ulNumber)) return false;
  if (sheet.ulDeferred) return true;
  return stripSummaryRows(sheet.rows).length === 0;
}

export function parseUlNumeric(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatWeightRu(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCostRu(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeUlTotals(rows: HaulzSheetRow[]): UlTotals {
  let weight = 0;
  let volume = 0;
  let cost = 0;
  let placeCount = 0;

  for (const row of rows) {
    if (!isUlDataRowFilled(row)) continue;
    placeCount += 1;
    weight += parseUlNumeric(row.weight);
    volume += parseUlNumeric(row.volume);
    cost += parseUlNumeric(row.cost);
  }

  return { weight, volume, placeCount, cost };
}

export function computeItogTotals(rows: HaulzSheetRow[]): ItogTotals {
  let weight = 0;
  let cost = 0;
  let placeCount = 0;

  for (const row of rows) {
    if (!isItogDataRowFilled(row)) continue;
    placeCount += 1;
    weight += parseUlNumeric(row.weight);
    cost += parseUlNumeric(row.cost);
  }

  return { placeCount, weight, cost };
}

export function computeKgdTotals(rows: HaulzSheetRow[]): KgdTotals {
  return { placeCount: countKgdDataRows(rows) };
}

export function formatUlSummaryRow(totals: UlTotals): HaulzSheetRow {
  return {
    _rowId: "__ul_summary__",
    _isSummary: true,
    rowNum: "",
    cargoPlace: "",
    parcel: "",
    airport: "",
    weight: `Вес брутто ${formatWeightRu(totals.weight)} кг`,
    volume: `Объём ${totals.volume.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}м³`,
    category: "",
    name: `Количество мест ${totals.placeCount}`,
    qty: "",
    cost: `Сумма ${formatCostRu(totals.cost)}`,
    mark: "",
    rowNumMirror: "",
    cargoMirror: "",
    inItog: "",
  };
}

export function formatItogSummaryRow(totals: ItogTotals): HaulzSheetRow {
  return {
    _rowId: "__itog_summary__",
    _isSummary: true,
    line: `Количество мест ${totals.placeCount}`,
    weight: `Вес брутто ${formatWeightRu(totals.weight)} кг`,
    cost: `Сумма ${formatCostRu(totals.cost)}`,
  };
}

export function formatKgdSummaryRow(totals: KgdTotals): HaulzSheetRow {
  return {
    _rowId: "__kgd_summary__",
    _isSummary: true,
    parcel: `Количество мест ${totals.placeCount}`,
  };
}

export function appendUlSummaryRow(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const dataRows = stripSummaryRows(rows);
  return [formatUlSummaryRow(computeUlTotals(dataRows)), ...dataRows];
}

export function appendItogSummaryRow(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const dataRows = stripSummaryRows(rows);
  return [formatItogSummaryRow(computeItogTotals(dataRows)), ...dataRows];
}

export function appendKgdSummaryRow(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const dataRows = stripSummaryRows(rows);
  return [formatKgdSummaryRow(computeKgdTotals(dataRows)), ...dataRows];
}

export function appendSheetSummaryRow(sheet: HaulzSheet): HaulzSheet {
  if (sheet.id === "itog") return { ...sheet, rows: appendItogSummaryRow(sheet.rows) };
  if (sheet.id === "kgd") return { ...sheet, rows: appendKgdSummaryRow(sheet.rows) };
  if (sheet.id.startsWith("ul-") && !sheet.ulDeferred) {
    return { ...sheet, rows: appendUlSummaryRow(sheet.rows) };
  }
  return sheet;
}

export function removeUlRow(sheet: HaulzSheet, rowId: string): HaulzSheet {
  if (!sheet.id.startsWith("ul-")) return sheet;
  const dataRows = stripSummaryRows(sheet.rows).filter((r) => r._rowId !== rowId);
  return {
    ...sheet,
    rows: appendUlSummaryRow(dataRows),
    ulLocallyEdited: true,
    ulDeferred: false,
  };
}

export function removeItogRow(sheet: HaulzSheet, rowId: string): HaulzSheet {
  return removeItogRows(sheet, [rowId]);
}

function itogRowMatchesDeleteTarget(row: HaulzSheetRow, targets: Set<string>): boolean {
  const id = String(row._rowId ?? "").trim();
  if (id && targets.has(id)) return true;
  const control = itogControlKey(row);
  return Boolean(control && (targets.has(control) || targets.has(`itog:${control}`)));
}

export function removeItogRows(sheet: HaulzSheet, rowIds: string[]): HaulzSheet {
  if (sheet.id !== "itog") return sheet;
  const targets = new Set(rowIds.map((id) => id.trim()).filter(Boolean));
  if (targets.size === 0) return sheet;
  const dataRows = stripSummaryRows(sheet.rows).filter((r) => !itogRowMatchesDeleteTarget(r, targets));
  return { ...sheet, rows: appendItogSummaryRow(dataRows) };
}

export function setSheetRowsMarkColor(
  sheet: HaulzSheet,
  rowIds: string[],
  color: string | null,
): HaulzSheet {
  const targets = new Set(rowIds.map((id) => id.trim()).filter(Boolean));
  if (targets.size === 0) return sheet;

  const mapRow = (row: HaulzSheetRow): HaulzSheetRow => {
    if (isSummaryRow(row) || !row._rowId || !targets.has(row._rowId)) return row;
    if (!color) {
      const { markColor: _removed, ...rest } = row;
      return rest;
    }
    return { ...row, markColor: color };
  };

  if (sheet.id === "itog") {
    return { ...sheet, rows: appendItogSummaryRow(stripSummaryRows(sheet.rows).map(mapRow)) };
  }
  if (sheet.id.startsWith("ul-")) {
    return {
      ...sheet,
      rows: appendUlSummaryRow(stripSummaryRows(sheet.rows).map(mapRow)),
      ulLocallyEdited: true,
    };
  }
  return { ...sheet, rows: stripSummaryRows(sheet.rows).map(mapRow) };
}

export function isItogStopRow(row: HaulzSheetRow, stopRows: HaulzSheetRow[] = []): boolean {
  if (isSummaryRow(row)) return false;
  if (String(row.stop ?? "").trim().toUpperCase() === "STOP") return true;
  const ulData = String(row.ulData ?? "").trim();
  if (!ulData || stopRows.length === 0) return false;
  return stopColumnValue(ulData, stopRows) === "STOP";
}

export function countItogStopRows(rows: HaulzSheetRow[], stopRows: HaulzSheetRow[] = []): number {
  return stripSummaryRows(rows).filter((r) => isItogStopRow(r, stopRows)).length;
}

export function removeItogStopRows(
  sheet: HaulzSheet,
  stopRows: HaulzSheetRow[] = [],
): { sheet: HaulzSheet; removed: number } {
  if (sheet.id !== "itog") return { sheet, removed: 0 };
  const dataRows = stripSummaryRows(sheet.rows);
  const kept = dataRows.filter((r) => !isItogStopRow(r, stopRows));
  const removed = dataRows.length - kept.length;
  return {
    sheet: { ...sheet, rows: appendItogSummaryRow(kept) },
    removed,
  };
}
