import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "../types.js";
import { itogControlKey } from "../itogRowKeys.js";
import { FIX_DEFAULT_SORT, sortDataRows } from "../rowSort.js";
import { isSummaryRow, isUlRowInItog, isUlRowInItogForWorkbook, stripSummaryRows, ulNumbersWithInItog } from "../ulTotals.js";

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

/** Наименование для таможенных документов: «Перевод», иначе «Данные УЛ». */
export function itogProductNameForTd(row: HaulzSheetRow): string {
  return cellStr(row.translate) || cellStr(row.ulData);
}

/** Поиск наименования по листам итог/FIX (перевод → данные УЛ). */
export function buildItogProductNameLookup(workbook: HaulzWorkbook): Map<string, string> {
  const map = new Map<string, string>();
  const addRows = (rows: HaulzSheetRow[]) => {
    for (const r of stripSummaryRows(rows)) {
      const productName = itogProductNameForTd(r);
      if (!productName) continue;
      const ul = cellStr(r.ul);
      const line = cellStr(r.line);
      const parcel = cellStr(r.parcel);
      const control = itogControlKey(r);
      if (control) map.set(`ctrl:${control}`, productName);
      if (parcel) map.set(`parcel:${parcel}`, productName);
      for (const ulKey of new Set([ul, normalizeUlKey(ul)].filter(Boolean))) {
        if (line) map.set(`ul:${ulKey}:${line}`, productName);
        if (line && parcel) map.set(`ulpc:${ulKey}:${line}:${parcel}`, productName);
      }
    }
  };
  const fix = workbook.sheets.find((s) => s.id === "fix");
  const itog = workbook.sheets.find((s) => s.id === "itog");
  if (fix) addRows(fix.rows);
  if (itog) addRows(itog.rows);
  return map;
}

export function lookupItogProductName(
  lookup: Map<string, string>,
  ulNumber: string,
  rowNum: string,
  parcel: string,
): string {
  const line = cellStr(rowNum);
  const p = cellStr(parcel);
  for (const ulKey of new Set([ulNumber, normalizeUlKey(ulNumber)].filter(Boolean))) {
    if (line && p) {
      const hit = lookup.get(`ulpc:${ulKey}:${line}:${p}`);
      if (hit) return hit;
    }
    if (line) {
      const hit = lookup.get(`ul:${ulKey}:${line}`);
      if (hit) return hit;
    }
    if (p) {
      const hit = lookup.get(`ctrl:${ulKey}${line}${p}`);
      if (hit) return hit;
    }
  }
  if (p) return lookup.get(`parcel:${p}`) ?? "";
  return "";
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

export function findUlSheet(workbook: HaulzWorkbook, ulNumber: string): HaulzSheet | undefined {
  const target = normalizeUlKey(ulNumber);
  return workbook.sheets.find((s) => {
    if (!s.id.startsWith("ul-")) return false;
    const idUl = s.id.slice(3);
    return idUl === ulNumber || normalizeUlKey(idUl) === target;
  });
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
    name: itogProductNameForTd(r),
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

export function collectWriteoffRowsForUl(
  workbook: HaulzWorkbook,
  sheet: HaulzSheet,
  ulNumber: string,
): UlWriteoffRow[] {
  const lookup = buildItogProductNameLookup(workbook);
  const controlKeys = workbook.itogControlKeys ?? new Set<string>();
  const dataRows = stripSummaryRows(sheet.rows).filter((r) =>
    isUlRowInItogForWorkbook(r, ulNumber, controlKeys),
  );
  const sorted = sortDataRows(dataRows, [{ key: "rowNum", dir: "asc" }]);
  return sorted.map((r, idx) => {
    const rowNum = cellStr(r.rowNum);
    const parcel = cellStr(r.parcel);
    const name =
      lookupItogProductName(lookup, ulNumber, rowNum, parcel) ||
      itogProductNameForTd(r) ||
      cellStr(r.name);
    return {
      num: idx + 1,
      ulNumber,
      rowNum,
      line: rowNum,
      id: cellStr(r.cargoPlace),
      parcel,
      airport: cellStr(r.airport),
      weight: r.weight ?? "",
      volume: r.volume ?? "",
      category: cellStr(r.category) || "<>",
      name,
      qty: r.qty ?? "",
      cost: r.cost ?? "",
    };
  });
}

export function ulSheetsWithInItog(workbook: HaulzWorkbook): Array<{ sheet: HaulzSheet; ulNumber: string }> {
  const ulNumbersInItog = ulNumbersWithInItog(workbook);
  const out: Array<{ sheet: HaulzSheet; ulNumber: string }> = [];
  for (const sheet of workbook.sheets) {
    const ul = parseUlNumber(sheet.id);
    if (!ul) continue;
    const ulNumber = cellStr(sheet.name) || ul;
    if (workbook.excludedUlNumbers?.has(ulNumber)) continue;
    const inItogSet =
      ulNumbersInItog.has(ulNumber) ||
      ulNumbersInItog.has(normalizeUlKey(ulNumber)) ||
      stripSummaryRows(sheet.rows).some((r) => isUlRowInItogForWorkbook(r, ulNumber, workbook.itogControlKeys ?? new Set()));
    if (!inItogSet) continue;
    out.push({ sheet, ulNumber });
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
