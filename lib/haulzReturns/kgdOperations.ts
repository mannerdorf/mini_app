import type { CellValue, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { itogControlKey, stableItogRowId } from "./itogRowKeys.js";
import { appendItogSummaryRow, appendKgdSummaryRow, isSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";
import { countUlPlaces, stopColumnValue, validateItogRow } from "./validators.js";

type UlRowMatch = {
  ulNumber: string;
  rowNum: string;
  cargoPlace: string;
  name: string;
  qty: CellValue;
  weight: CellValue;
  cost: CellValue;
};

function findUlRowInWorkbook(workbook: HaulzWorkbook, parcel: string, ulHint = ""): UlRowMatch | null {
  const ulSheets = workbook.sheets.filter((s) => s.id.startsWith("ul-"));
  const preferred = ulHint ? ulSheets.filter((s) => s.id === `ul-${ulHint}`) : [];
  const rest = ulSheets.filter((s) => !preferred.includes(s));
  for (const sheet of [...preferred, ...rest]) {
    for (const row of sheet.rows) {
      if (isSummaryRow(row)) continue;
      if (String(row.parcel ?? "").trim() === parcel) {
        return {
          ulNumber: sheet.id.slice(3),
          rowNum: String(row.rowNum ?? ""),
          cargoPlace: String(row.cargoPlace ?? ""),
          name: String(row.name ?? ""),
          qty: row.qty ?? "",
          weight: row.weight ?? "",
          cost: row.cost ?? "",
        };
      }
    }
  }
  return null;
}

export function recalcKgdDupCounts(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (isSummaryRow(row)) continue;
    const parcel = String(row.parcel ?? "").trim();
    if (parcel) counts.set(parcel, (counts.get(parcel) ?? 0) + 1);
  }
  return rows.map((row) => {
    if (isSummaryRow(row)) return row;
    const parcel = String(row.parcel ?? "").trim();
    return { ...row, dupCount: parcel ? (counts.get(parcel) ?? 0) : 0 };
  });
}

export function renumberKgdRows(rows: HaulzSheetRow[]): HaulzSheetRow[] {
  return rows.map((row, i) => ({ ...row, num: i + 1, _rowId: `kgd-${i}` }));
}

/** Оставляет первое вхождение каждой посылки, остальные дубли удаляет. */
export function removeKgdDuplicates(workbook: HaulzWorkbook): HaulzWorkbook {
  const kgdSheet = workbook.sheets.find((s) => s.id === "kgd");
  if (!kgdSheet) return workbook;

  const seen = new Set<string>();
  const kept: HaulzSheetRow[] = [];
  for (const row of stripSummaryRows(kgdSheet.rows)) {
    const parcel = String(row.parcel ?? "").trim();
    if (!parcel) {
      kept.push(row);
      continue;
    }
    if (seen.has(parcel)) continue;
    seen.add(parcel);
    kept.push(row);
  }

  const rows = appendKgdSummaryRow(renumberKgdRows(recalcKgdDupCounts(kept)));
  return {
    ...workbook,
    sheets: workbook.sheets.map((s) => (s.id === "kgd" ? { ...s, rows } : s)),
  };
}

/** Пересобирает лист «итог» по текущим строкам KGD. */
export function rebuildItogFromKgd(workbook: HaulzWorkbook): HaulzWorkbook {
  const kgdSheet = workbook.sheets.find((s) => s.id === "kgd");
  if (!kgdSheet) return workbook;

  const plombySheet = workbook.sheets.find((s) => s.id === "plomby");
  const sealMap = new Map<string, string>();
  for (const row of plombySheet?.rows ?? []) {
    const parcel = String(row.parcel ?? "").trim();
    if (parcel) sealMap.set(parcel, String(row.cargoPlace ?? ""));
  }

  const oldItogByControl = new Map<string, HaulzSheetRow>();
  const oldItogByParcel = new Map<string, HaulzSheetRow>();
  for (const row of workbook.sheets.find((s) => s.id === "itog")?.rows ?? []) {
    const control = itogControlKey(row);
    const parcel = String(row.parcel ?? "").trim();
    if (control && !oldItogByControl.has(control)) oldItogByControl.set(control, row);
    if (parcel && !oldItogByParcel.has(parcel)) oldItogByParcel.set(parcel, row);
  }

  const stopRows = workbook.sheets.find((s) => s.id === "stop")?.rows ?? [];

  const itogRows: HaulzSheetRow[] = [];
  let num = 0;

  for (const kgdRow of stripSummaryRows(kgdSheet.rows)) {
    const parcel = String(kgdRow.parcel ?? "").trim();
    if (!parcel) continue;
    num++;

    const ulHint = String(kgdRow.ul ?? "");
    const ulMatch = findUlRowInWorkbook(workbook, parcel, ulHint);
    const oldByParcel = oldItogByParcel.get(parcel);

    const ul = ulHint || ulMatch?.ulNumber || String(oldByParcel?.ul ?? "");
    const line = String(kgdRow.line ?? "") || ulMatch?.rowNum || String(oldByParcel?.line ?? "");
    const control = `${ul}${line}${parcel}`;
    const old = oldItogByControl.get(control) ?? oldByParcel;
    const id = ulMatch?.cargoPlace || String(old?.id ?? "");
    const ulData = ulMatch?.name || String(old?.ulData ?? "");
    const validation = validateItogRow(ulData);

    itogRows.push({
      _rowId: stableItogRowId({ control, parcel }),
      num,
      ul,
      line,
      id,
      parcel,
      ulData,
      translate: String(old?.translate ?? ""),
      qty: ulMatch?.qty ?? old?.qty ?? "",
      weight: ulMatch?.weight ?? old?.weight ?? "",
      cost: ulMatch?.cost ?? old?.cost ?? "",
      seal: sealMap.get(parcel) ?? String(old?.seal ?? ""),
      ulPlaces: 0,
      stop: stopColumnValue(ulData, stopRows),
      chars: ulData.length,
      control,
      englishOnly: validation.englishOnly,
      au585: validation.au585,
      digitsOnly: validation.digitsOnly,
      pinkList: validation.pinkList,
    });
  }

  const idUlPairs = itogRows.map((r) => ({ ul: String(r.ul ?? ""), id: String(r.id ?? "") }));
  for (const row of itogRows) {
    row.ulPlaces = countUlPlaces(idUlPairs, String(row.ul ?? ""));
  }

  let next: HaulzWorkbook = {
    ...workbook,
    sheets: workbook.sheets.map((s) => (s.id === "itog" ? { ...s, rows: appendItogSummaryRow(itogRows) } : s)),
  };
  next = recalcWorkbookAfterItogChange(next);

  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const sheets = [...next.sheets];
    sheets[fixIdx] = buildFixSheetFromItog(itog);
    next = { ...next, sheets };
  }

  return next;
}
