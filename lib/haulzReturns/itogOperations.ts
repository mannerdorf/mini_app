import type { HaulzWorkbook } from "./types.js";
import { appendItogSummaryRow, countItogStopRows, removeItogRows, removeItogStopRows, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

export function countItogStopRowsInWorkbook(workbook: HaulzWorkbook): number {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return 0;
  const stopRows = workbook.sheets.find((s) => s.id === "stop")?.rows ?? [];
  return countItogStopRows(itogSheet.rows, stopRows);
}

export function removeItogStopRowsFromWorkbook(workbook: HaulzWorkbook): {
  workbook: HaulzWorkbook;
  removed: number;
} {
  const recalculated = recalcWorkbookAfterItogChange(workbook);
  const stopRows = recalculated.sheets.find((s) => s.id === "stop")?.rows ?? [];
  const itogSheet = recalculated.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return { workbook, removed: 0 };

  const { sheet, removed } = removeItogStopRows(itogSheet, stopRows);
  if (removed === 0) return { workbook: recalculated, removed: 0 };

  let next = recalcWorkbookAfterItogChange({
    ...recalculated,
    sheets: recalculated.sheets.map((s) => (s.id === "itog" ? sheet : s)),
  });

  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const sheets = [...next.sheets];
    sheets[fixIdx] = buildFixSheetFromItog(itog);
    next = { ...next, sheets };
  }

  return { workbook: next, removed };
}

export function setItogRowsMarkColorInWorkbook(
  workbook: HaulzWorkbook,
  rowIds: string[],
  color: string | null,
): HaulzWorkbook {
  const targets = new Set(rowIds.map((id) => id.trim()).filter(Boolean));
  if (targets.size === 0) return workbook;

  const itogIdx = workbook.sheets.findIndex((s) => s.id === "itog");
  if (itogIdx < 0) return workbook;

  const itog = workbook.sheets[itogIdx]!;
  const dataRows = stripSummaryRows(itog.rows).map((row) => {
    if (!row._rowId || !targets.has(row._rowId)) return row;
    if (!color) {
      const { markColor: _removed, ...rest } = row;
      return rest;
    }
    return { ...row, markColor: color };
  });

  let sheets = [...workbook.sheets];
  sheets[itogIdx] = { ...itog, rows: appendItogSummaryRow(dataRows) };

  const fixIdx = sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    sheets[fixIdx] = buildFixSheetFromItog(sheets[itogIdx]!);
  }

  return { ...workbook, sheets };
}

export function removeItogRowsFromWorkbook(
  workbook: HaulzWorkbook,
  rowIds: string[],
): { workbook: HaulzWorkbook; removed: number } {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return { workbook, removed: 0 };

  const before = stripSummaryRows(itogSheet.rows).length;
  const nextItog = removeItogRows(itogSheet, rowIds);
  const after = stripSummaryRows(nextItog.rows).length;
  const removed = before - after;
  if (removed <= 0) return { workbook, removed: 0 };

  let next = recalcWorkbookAfterItogChange({
    ...workbook,
    sheets: workbook.sheets.map((s) => (s.id === "itog" ? nextItog : s)),
  });

  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const sheets = [...next.sheets];
    sheets[fixIdx] = buildFixSheetFromItog(itog);
    next = { ...next, sheets };
  }

  return { workbook: next, removed };
}
