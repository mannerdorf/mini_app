import type { Pool, PoolClient } from "pg";
import type { HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";
import { STOP_WORDS, normalizeStopMatchMode, type StopMatchMode } from "./stopWords.js";

export type GlobalStopWord = {
  id: number;
  word: string;
  result: string;
  matchMode: StopMatchMode;
};

const BUILTIN_BY_WORD = new Map(
  STOP_WORDS.map((e) => [normalizeStopWordKey(e.word), e] as const),
);

export function normalizeStopWordKey(word: unknown): string {
  return String(word ?? "").trim().toLocaleLowerCase("ru");
}

/** Встроенные строки из buildWorkbook: stop-0, stop-1, … */
export function isBuiltInStopRowId(rowId: unknown): boolean {
  return /^stop-\d+$/.test(String(rowId ?? "").trim());
}

export function globalStopRowId(id: number): string {
  return `stop-global-${id}`;
}

export function parseGlobalStopRowId(rowId: string): number | null {
  const m = /^stop-global-(\d+)$/.exec(String(rowId ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function recalcAfterStopSheetChange(workbook: HaulzWorkbook): HaulzWorkbook {
  let next = recalcWorkbookAfterItogChange(workbook);
  const fixIdx = next.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = next.sheets.find((s) => s.id === "itog");
    if (itog) {
      const sheets = [...next.sheets];
      sheets[fixIdx] = buildFixSheetFromItog(itog);
      next = { ...next, sheets };
    }
  }
  return next;
}

/** Строки STOP-листа, которые нужно хранить в общей БД. */
export function extractStopWordsForPersistence(rows: HaulzSheetRow[]): {
  word: string;
  result: string;
  matchMode: StopMatchMode;
}[] {
  const out = new Map<string, { word: string; result: string; matchMode: StopMatchMode }>();
  for (const row of rows) {
    const word = String(row.word ?? "").trim();
    if (!word) continue;
    const key = normalizeStopWordKey(word);
    const builtin = BUILTIN_BY_WORD.get(key);
    const matchMode = normalizeStopMatchMode(row.matchMode);
    const modeChanged = Boolean(builtin && matchMode !== normalizeStopMatchMode(builtin.matchMode));
    const isSessionCustom = !isBuiltInStopRowId(row._rowId);
    if (!builtin || modeChanged || isSessionCustom) {
      out.set(key, {
        word,
        result: String(row.result ?? "STOP").trim() || "STOP",
        matchMode,
      });
    }
  }
  return [...out.values()];
}

export function applyGlobalStopWords(workbook: HaulzWorkbook, globalRows: GlobalStopWord[]): HaulzWorkbook {
  if (globalRows.length === 0) return workbook;
  const idx = workbook.sheets.findIndex((s) => s.id === "stop");
  if (idx < 0) return workbook;

  const sheet = workbook.sheets[idx]!;
  const globalByWord = new Map(globalRows.map((g) => [normalizeStopWordKey(g.word), g]));
  const seen = new Set<string>();
  const mergedRows: HaulzSheetRow[] = [];

  for (const row of sheet.rows) {
    const key = normalizeStopWordKey(row.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const g = globalByWord.get(key);
    if (!g) {
      mergedRows.push(row);
      continue;
    }
    if (isBuiltInStopRowId(row._rowId)) {
      mergedRows.push({
        ...row,
        matchMode: g.matchMode,
        result: g.result,
      });
    } else {
      mergedRows.push({
        _rowId: globalStopRowId(g.id),
        word: g.word,
        result: g.result,
        matchMode: g.matchMode,
      });
    }
  }

  for (const g of globalRows) {
    const key = normalizeStopWordKey(g.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    mergedRows.push({
      _rowId: globalStopRowId(g.id),
      word: g.word,
      result: g.result,
      matchMode: g.matchMode,
    });
  }

  const sheets = [...workbook.sheets];
  sheets[idx] = { ...sheet, rows: mergedRows };
  return recalcAfterStopSheetChange({ ...workbook, sheets });
}
