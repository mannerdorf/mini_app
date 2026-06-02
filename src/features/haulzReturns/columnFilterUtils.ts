import type { HaulzColumn, HaulzSheetRow } from "../../lib/haulzReturns";
import { isSummaryRow } from "../../lib/haulzReturns";
import {
  normalizeStopMatchMode,
  STOP_MATCH_MODE_LABELS,
  type StopMatchMode,
} from "../../lib/haulzReturns/stopWords";

export const EMPTY_CELL_LABEL = "(Пусто)";

export function formatCellValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return EMPTY_CELL_LABEL;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v).trim() || EMPTY_CELL_LABEL;
}

export function formatCellDisplay(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export function columnCellFilterLabel(
  row: HaulzSheetRow,
  col: HaulzColumn,
  sheetId?: string,
): string {
  if (sheetId === "stop" && col.key === "matchMode") {
    return STOP_MATCH_MODE_LABELS[normalizeStopMatchMode(row.matchMode)];
  }
  return formatCellValue(row[col.key]);
}

/** Значения столбца из строк (без суммирующей), пустые пропускаются. */
export function columnValuesFromRows(rows: HaulzSheetRow[], colKey: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (isSummaryRow(row)) continue;
    const v = formatCellDisplay(row[colKey]).trim();
    if (v) out.push(v);
  }
  return out;
}

export function uniqueColumnValues(rows: HaulzSheetRow[], col: HaulzColumn, sheetId?: string): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (isSummaryRow(row)) continue;
    set.add(columnCellFilterLabel(row, col, sheetId));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" }));
}

export function applyColumnFilters(
  rows: HaulzSheetRow[],
  columns: HaulzColumn[],
  filters: Record<string, Set<string> | null | undefined>,
  sheetId?: string,
): HaulzSheetRow[] {
  const summaryRows = rows.filter(isSummaryRow);
  const dataRows = rows.filter((r) => !isSummaryRow(r));

  const active = columns.filter((col) => {
    const allowed = filters[col.key];
    return allowed != null;
  });
  if (active.length === 0) return rows;

  const filtered = dataRows.filter((row) =>
    active.every((col) => {
      const allowed = filters[col.key]!;
      return allowed.has(columnCellFilterLabel(row, col, sheetId));
    }),
  );
  return [...summaryRows, ...filtered];
}

export function isColumnFilterActive(
  colKey: string,
  filters: Record<string, Set<string> | null | undefined>,
  allValues: string[],
): boolean {
  const allowed = filters[colKey];
  if (allowed == null) return false;
  return allowed.size < allValues.length;
}
