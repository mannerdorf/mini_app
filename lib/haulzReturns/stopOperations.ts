import type { HaulzSheetRow, HaulzWorkbook } from "./types.js";
import type { StopMatchMode } from "./stopWords.js";
import { normalizeStopMatchMode } from "./stopWords.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

function recalcAfterStopSheetChange(workbook: HaulzWorkbook): HaulzWorkbook {
  let next = recalcWorkbookAfterItogChange(workbook);
  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const sheets = [...next.sheets];
    sheets[fixIdx] = buildFixSheetFromItog(itog);
    next = { ...next, sheets };
  }
  return next;
}

export function addStopWord(
  workbook: HaulzWorkbook,
  word: string,
  result = "STOP",
  matchMode: StopMatchMode = "exact",
): { workbook: HaulzWorkbook; added: boolean } {
  const trimmed = word.trim();
  if (!trimmed) return { workbook, added: false };

  const stopSheet = workbook.sheets.find((s) => s.id === "stop");
  if (!stopSheet) return { workbook, added: false };

  if (stopSheet.rows.some((r) => String(r.word ?? "").trim() === trimmed)) {
    return { workbook, added: false };
  }

  const newRow: HaulzSheetRow = {
    _rowId: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    word: trimmed,
    result: result.trim() || "STOP",
    matchMode: normalizeStopMatchMode(matchMode),
  };

  const sheets = workbook.sheets.map((s) =>
    s.id === "stop" ? { ...s, rows: [...s.rows, newRow] } : s,
  );

  return { workbook: recalcAfterStopSheetChange({ ...workbook, sheets }), added: true };
}

export function updateStopWordMatchMode(
  workbook: HaulzWorkbook,
  rowId: string,
  matchMode: StopMatchMode,
): HaulzWorkbook {
  const mode = normalizeStopMatchMode(matchMode);
  const sheets = workbook.sheets.map((s) =>
    s.id === "stop"
      ? {
          ...s,
          rows: s.rows.map((r) => (r._rowId === rowId ? { ...r, matchMode: mode } : r)),
        }
      : s,
  );
  return recalcAfterStopSheetChange({ ...workbook, sheets });
}

export function removeStopWord(workbook: HaulzWorkbook, rowId: string): HaulzWorkbook {
  const sheets = workbook.sheets.map((s) =>
    s.id === "stop" ? { ...s, rows: s.rows.filter((r) => r._rowId !== rowId) } : s,
  );
  return recalcAfterStopSheetChange({ ...workbook, sheets });
}
