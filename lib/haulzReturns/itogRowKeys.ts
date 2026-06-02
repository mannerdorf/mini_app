import type { HaulzSheetRow } from "./types.js";
import { stripSummaryRows } from "./ulTotals.js";

/** Стабильный ключ строки итога для сопоставления перевода (control → _rowId → parcel). */
export function itogRowTranslateKey(row: HaulzSheetRow): string {
  const control = String(row.control ?? "").trim();
  if (control) return control;
  const rowId = String(row._rowId ?? "").trim();
  if (rowId) return rowId;
  const parcel = String(row.parcel ?? "").trim();
  const num = String(row.num ?? "").trim();
  if (parcel) return num ? `itog-${num}-${parcel}` : parcel;
  return "";
}

export function ensureItogRowIds(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  return stripSummaryRows(rows).map((row, idx) => {
    if (String(row._rowId ?? "").trim()) return row;
    const parcel = String(row.parcel ?? "").trim();
    const num = row.num ?? idx + 1;
    const rowId = parcel ? `itog-${num}-${parcel}` : `itog-${num}-${idx}`;
    const control = String(row.control ?? "").trim() || `${String(row.ul ?? "")}${String(row.line ?? "")}${parcel}`;
    return { ...row, _rowId: rowId, control };
  });
}
