import type { HaulzWorkbook } from "./types.js";
import { countItogStopRows, removeItogStopRows } from "./ulTotals.js";
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
