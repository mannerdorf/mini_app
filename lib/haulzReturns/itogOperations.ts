import type { HaulzWorkbook } from "./types.js";
import { removeItogStopRows } from "./ulTotals.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

export function removeItogStopRowsFromWorkbook(workbook: HaulzWorkbook): {
  workbook: HaulzWorkbook;
  removed: number;
} {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return { workbook, removed: 0 };

  const { sheet, removed } = removeItogStopRows(itogSheet);
  if (removed === 0) return { workbook, removed: 0 };

  let next = recalcWorkbookAfterItogChange({
    ...workbook,
    sheets: workbook.sheets.map((s) => (s.id === "itog" ? sheet : s)),
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
