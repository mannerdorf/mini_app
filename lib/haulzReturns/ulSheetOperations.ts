import type { HaulzWorkbook } from "./types.js";
import { appendItogSummaryRow, appendKgdSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

export function parseUlSheetId(sheetId: string): string | null {
  if (!sheetId.startsWith("ul-")) return null;
  const ulNumber = sheetId.slice(3).trim();
  return ulNumber.length > 0 ? ulNumber : null;
}

/** Убирает лист УЛ и связанные строки итога/KGD без изменения excludedUlNumbers. */
export function stripUlFromWorkbook(workbook: HaulzWorkbook, ulNumber: string): HaulzWorkbook {
  const sheetId = `ul-${ulNumber}`;
  if (!workbook.sheets.some((s) => s.id === sheetId)) {
    const hasItogRows = workbook.sheets
      .find((s) => s.id === "itog")
      ?.rows.some((r) => String(r.ul ?? "") === ulNumber);
    if (!hasItogRows) return workbook;
  }

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

/** Применяет список исключённых УЛ к workbook (после пересборки из файлов). */
export function applyExcludedUlNumbers(workbook: HaulzWorkbook): HaulzWorkbook {
  const excluded = workbook.excludedUlNumbers ?? new Set<string>();
  if (excluded.size === 0) return { ...workbook, excludedUlNumbers: excluded };
  let next = workbook;
  for (const ul of excluded) {
    next = stripUlFromWorkbook(next, ul);
  }
  return { ...next, excludedUlNumbers: excluded };
}

/** Удаляет лист УЛ, строки итога с этим номером УЛ и сбрасывает ссылку на УЛ в KGD. */
export function removeUlSheetFromWorkbook(workbook: HaulzWorkbook, sheetId: string): HaulzWorkbook {
  const ulNumber = parseUlSheetId(sheetId);
  if (!ulNumber) return workbook;
  if (!workbook.sheets.some((s) => s.id === sheetId)) {
    const hasItogRows = workbook.sheets
      .find((s) => s.id === "itog")
      ?.rows.some((r) => String(r.ul ?? "") === ulNumber);
    if (!hasItogRows) return workbook;
  }

  const excludedUlNumbers = new Set(workbook.excludedUlNumbers ?? []);
  excludedUlNumbers.add(ulNumber);
  return { ...stripUlFromWorkbook(workbook, ulNumber), excludedUlNumbers };
}
