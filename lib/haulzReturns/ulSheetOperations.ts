import type { HaulzWorkbook } from "./types.js";
import { appendItogSummaryRow, appendKgdSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

export function parseUlSheetId(sheetId: string): string | null {
  if (!sheetId.startsWith("ul-")) return null;
  const ulNumber = sheetId.slice(3).trim();
  return ulNumber.length > 0 ? ulNumber : null;
}

/** Удаляет лист УЛ, строки итога с этим номером УЛ и сбрасывает ссылку на УЛ в KGD. */
export function removeUlSheetFromWorkbook(workbook: HaulzWorkbook, sheetId: string): HaulzWorkbook {
  const ulNumber = parseUlSheetId(sheetId);
  if (!ulNumber || !workbook.sheets.some((s) => s.id === sheetId)) return workbook;

  let sheets = workbook.sheets.filter((s) => s.id !== sheetId);

  const itogSheet = sheets.find((s) => s.id === "itog");
  if (itogSheet) {
    const kept = stripSummaryRows(itogSheet.rows).filter((r) => String(r.ul ?? "") !== ulNumber);
    sheets = sheets.map((s) => (s.id === "itog" ? { ...s, rows: appendItogSummaryRow(kept) } : s));
  }

  sheets = sheets.map((s) => {
    if (s.id !== "kgd") return s;
    const kept = stripSummaryRows(s.rows).map((row) =>
      String(row.ul ?? "") === ulNumber ? { ...row, ul: "", line: "" } : row,
    );
    return { ...s, rows: appendKgdSummaryRow(kept) };
  });

  let next = recalcWorkbookAfterItogChange({ ...workbook, sheets });

  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const updated = [...next.sheets];
    updated[fixIdx] = buildFixSheetFromItog(itog);
    next = { ...next, sheets: updated };
  }

  return next;
}
