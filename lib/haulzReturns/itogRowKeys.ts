import type { HaulzSheetRow } from "./types.js";
import { stripSummaryRows } from "./ulTotals.js";

/** Стабильный ключ строки итога для сопоставления перевода (_rowId → control → parcel). */
export function itogRowTranslateKey(row: HaulzSheetRow): string {
  const rowId = String(row._rowId ?? "").trim();
  if (rowId) return rowId;
  const control = String(row.control ?? "").trim();
  if (control) return control;
  const parcel = String(row.parcel ?? "").trim();
  const num = String(row.num ?? "").trim();
  if (parcel) return num ? `itog-${num}-${parcel}` : parcel;
  return "";
}

export function ensureItogRowIds(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  return stripSummaryRows(rows).map((row, idx) => {
    const parcel = String(row.parcel ?? "").trim();
    const num = row.num ?? idx + 1;
    const rowId =
      String(row._rowId ?? "").trim() || (parcel ? `itog-${num}-${parcel}` : `itog-${num}-${idx}`);
    const control =
      String(row.control ?? "").trim() || `${String(row.ul ?? "")}${String(row.line ?? "")}${parcel}`;
    if (String(row._rowId ?? "").trim() === rowId && String(row.control ?? "").trim() === control) {
      return row;
    }
    return { ...row, _rowId: rowId, control };
  });
}
