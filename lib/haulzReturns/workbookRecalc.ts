import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { FIX_COLUMNS } from "./types.js";
import { countUlPlaces, stopColumnValue, validateItogRow } from "./validators.js";

export function recalcWorkbookAfterItogChange(workbook: HaulzWorkbook): HaulzWorkbook {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return workbook;

  const idUlPairs = itogSheet.rows.map((r) => ({
    ul: String(r.ul ?? ""),
    id: String(r.id ?? ""),
  }));

  const updatedItogRows = itogSheet.rows.map((r, idx) => {
    const ulData = String(r.ulData ?? "");
    const validation = validateItogRow(ulData);
    const ul = String(r.ul ?? "");
    return {
      ...r,
      num: idx + 1,
      ulPlaces: countUlPlaces(idUlPairs, ul),
      stop: stopColumnValue(ulData),
      chars: ulData.length,
      englishOnly: validation.englishOnly,
      au585: validation.au585,
      digitsOnly: validation.digitsOnly,
      pinkList: validation.pinkList,
    };
  });

  const controlKeys = new Set(updatedItogRows.map((r) => String(r.control ?? "")));

  const sheets = workbook.sheets.map((sheet) => {
    if (sheet.id === "itog") {
      return { ...sheet, rows: updatedItogRows };
    }
    if (sheet.id.startsWith("ul-")) {
      return {
        ...sheet,
        rows: sheet.rows.map((row) => {
          const key = `${row.mark ?? ""}${row.rowNum ?? ""}${row.parcel ?? ""}`;
          return { ...row, inItog: controlKeys.has(key) ? 1 : 0 };
        }),
      };
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
    rows: itogSheet.rows.map((r) => {
      const out: HaulzSheetRow = { _rowId: r._rowId };
      for (const col of FIX_COLUMNS) {
        out[col.key] = r[col.key] ?? "";
      }
      return out;
    }),
  };
}
