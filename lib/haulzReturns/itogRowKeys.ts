import type { HaulzSheetRow } from "./types.js";
import { stripSummaryRows } from "./ulTotals.js";

/** Контрольный ключ строки итога (УЛ + строка + посылка). */
export function itogControlKey(row: HaulzSheetRow): string {
  const control = String(row.control ?? "").trim();
  if (control) return control;
  const ul = String(row.ul ?? "");
  const line = String(row.line ?? "");
  const parcel = String(row.parcel ?? "").trim();
  return parcel ? `${ul}${line}${parcel}` : "";
}

/** Стабильный _rowId: не зависит от порядкового num после удаления строк. */
export function stableItogRowId(row: HaulzSheetRow): string {
  const control = itogControlKey(row);
  if (control) return `itog:${control}`;
  const parcel = String(row.parcel ?? "").trim();
  if (parcel) return `itog:parcel:${parcel}`;
  return "";
}

/** Старый формат id (itog-{num}-{parcel}) — только для обратной совместимости. */
export function legacyItogRowId(row: HaulzSheetRow): string {
  const parcel = String(row.parcel ?? "").trim();
  const num = row.num;
  if (parcel && num != null && String(num).trim() !== "") {
    return `itog-${num}-${parcel}`;
  }
  return "";
}

const LEGACY_ROW_ID = /^itog-\d+-/;

function shouldMigrateRowId(existing: string, control: string): boolean {
  if (!control) return false;
  if (!existing) return true;
  return LEGACY_ROW_ID.test(existing);
}

/** Стабильный ключ строки итога для сопоставления перевода. */
export function itogRowTranslateKey(row: HaulzSheetRow): string {
  const rowId = String(row._rowId ?? "").trim();
  if (rowId) return rowId;
  const stable = stableItogRowId(row);
  if (stable) return stable;
  return legacyItogRowId(row);
}

/** Ключи для поиска перевода (без голого parcel — он не уникален). */
export function itogRowTranslationLookupKeys(row: HaulzSheetRow): string[] {
  const control = itogControlKey(row);
  const stable = stableItogRowId(row);
  const legacy = legacyItogRowId(row);
  const rowId = String(row._rowId ?? "").trim();
  return [...new Set([rowId, stable, control, legacy, itogRowTranslateKey(row)].filter(Boolean))];
}

export function ensureItogRowIds(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  return stripSummaryRows(rows).map((row, idx) => {
    const control = itogControlKey(row);
    const existing = String(row._rowId ?? "").trim();
    const stableId = stableItogRowId(row) || `itog:idx:${idx}`;
    const rowId = shouldMigrateRowId(existing, control) ? stableId : existing || stableId;
    if (existing === rowId && String(row.control ?? "").trim() === control) {
      return row;
    }
    return { ...row, _rowId: rowId, control: control || String(row.control ?? "") };
  });
}
