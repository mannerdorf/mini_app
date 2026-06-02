import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { FIX_COLUMNS } from "./types.js";
import { appendItogSummaryRow, isSummaryRow, stripSummaryRows, syncUlSheetFromControlKeys } from "./ulTotals.js";
import { countUlPlaces, stopColumnValue, validateItogRow } from "./validators.js";

export function recalcWorkbookAfterItogChange(workbook: HaulzWorkbook): HaulzWorkbook {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return workbook;

  const stopRows = workbook.sheets.find((s) => s.id === "stop")?.rows ?? [];

  const dataRows = stripSummaryRows(itogSheet.rows);

  const idUlPairs = dataRows.map((r) => ({
    ul: String(r.ul ?? ""),
    id: String(r.id ?? ""),
  }));

  const updatedDataRows = dataRows.map((r, idx) => {
    const ulData = String(r.ulData ?? "");
    const validation = validateItogRow(ulData);
    const ul = String(r.ul ?? "");
    return {
      ...r,
      num: idx + 1,
      ulPlaces: countUlPlaces(idUlPairs, ul),
      stop: stopColumnValue(ulData, stopRows),
      chars: ulData.length,
      englishOnly: validation.englishOnly,
      au585: validation.au585,
      digitsOnly: validation.digitsOnly,
      pinkList: validation.pinkList,
    };
  });

  const controlKeys = new Set(updatedDataRows.map((r) => String(r.control ?? "")));

  const sheets = workbook.sheets.map((sheet) => {
    if (sheet.id === "itog") {
      return { ...sheet, rows: appendItogSummaryRow(updatedDataRows) };
    }
    if (sheet.id.startsWith("ul-")) {
      return syncUlSheetFromControlKeys(sheet, controlKeys);
    }
    return sheet;
  });

  return { sheets, itogControlKeys: controlKeys };
}

export function buildFixSheetFromItog(itogSheet: HaulzSheet): HaulzSheet {
  return {
    id: "fix",
    name: "FIX",
    columns: FIX_COLUMNS,
    rows: stripSummaryRows(itogSheet.rows).map((r) => {
      const out: HaulzSheetRow = { _rowId: r._rowId };
      for (const col of FIX_COLUMNS) {
        out[col.key] = r[col.key] ?? "";
      }
      return out;
    }),
  };
}
