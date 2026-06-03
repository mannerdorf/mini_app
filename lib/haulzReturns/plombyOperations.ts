import type { HaulzSheet, HaulzSheetRow } from "./types.js";
import { PLOMBY_HEADERS } from "./types.js";
import { isSummaryRow, stripSummaryRows } from "./ulTotals.js";

/** Строка с полями итога (или summary), ошибочно попавшая на лист «пломбы». */
export function isItogShapedPlombyRow(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return true;
  const rowId = String(row._rowId ?? "");
  if (rowId.startsWith("itog:") || /^itog-\d+-/.test(rowId)) return true;
  if (String(row.ulData ?? "").trim()) return true;
  if (String(row.control ?? "").trim()) return true;
  if (String(row.translate ?? "").trim()) return true;
  if (row.num != null && String(row.num).trim() !== "") return true;
  if (row.dupCount != null && String(row.dupCount).trim() !== "") return true;
  if (row.englishOnly != null || row.au585 != null || row.pinkList != null || row.digitsOnly != null) {
    return true;
  }
  if (String(row.stop ?? "").trim() || row.chars != null) return true;
  const parcel = String(row.parcel ?? "");
  if (parcel.includes("Количество мест")) return true;
  return false;
}

export function normalizePlombyDataRow(row: HaulzSheetRow): HaulzSheetRow {
  const parcel = String(row.parcel ?? "").trim();
  const cargoPlace = String(row.cargoPlace ?? row.id ?? row.seal ?? "").trim();
  return { parcel, cargoPlace };
}

export function ensurePlombyRowIds(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const parcelDup = new Map<string, number>();
  return rows.map((row, idx) => {
    const base = normalizePlombyDataRow(row);
    const parcel = String(base.parcel ?? "").trim();
    let stableId = parcel ? `plomby:${parcel}` : `plomby:idx:${idx}`;
    if (parcel) {
      const n = parcelDup.get(parcel) ?? 0;
      parcelDup.set(parcel, n + 1);
      if (n > 0) stableId = `${stableId}#${n}`;
    }
    const existing = String(row._rowId ?? "").trim();
    const rowId =
      existing && existing.startsWith("plomby:") && !existing.startsWith("itog") ? existing : stableId;
    return { ...base, _rowId: rowId };
  });
}

export function plombyRowsFromItog(itogRows: HaulzSheetRow[]): HaulzSheetRow[] {
  const rows = stripSummaryRows(itogRows)
    .map((r) =>
      normalizePlombyDataRow({
        parcel: r.parcel,
        cargoPlace: r.seal ?? r.id ?? r.cargoPlace,
      }),
    )
    .filter((r) => String(r.parcel ?? "").trim());
  return ensurePlombyRowIds(rows);
}

/** Оставляет только строки пломб; убирает summary и копии итога/KGD. */
export function sanitizePlombyRows(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const kept: HaulzSheetRow[] = [];
  for (const row of stripSummaryRows(rows)) {
    if (isItogShapedPlombyRow(row)) continue;
    const parcel = String(row.parcel ?? "").trim();
    if (!parcel) continue;
    kept.push(normalizePlombyDataRow(row));
  }
  return ensurePlombyRowIds(kept);
}

export function sanitizePlombySheet(sheet: HaulzSheet, itogSheet?: HaulzSheet | null): HaulzSheet {
  let rows = sanitizePlombyRows(sheet.rows);
  if (rows.length === 0 && itogSheet?.rows?.length) {
    rows = plombyRowsFromItog(itogSheet.rows);
  }
  return { ...sheet, columns: [...PLOMBY_HEADERS], rows };
}
