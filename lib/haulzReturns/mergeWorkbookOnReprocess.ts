import type { HaulzSheet, HaulzWorkbook } from "./types.js";
import { itogControlKey } from "./itogRowKeys.js";
import { appendItogSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { applyExcludedUlNumbers, parseUlSheetId } from "./ulSheetOperations.js";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc.js";

const PRESERVE_SHEET_IDS = new Set(["stop"]);

function mergeItogRow(oldRow: import("./types.js").HaulzSheetRow, newRow: import("./types.js").HaulzSheetRow) {
  const oldUl = String(oldRow.ulData ?? "").trim();
  const newUl = String(newRow.ulData ?? "").trim();
  return {
    ...newRow,
    translate: String(oldRow.translate ?? "").trim() || String(newRow.translate ?? "").trim(),
    ulData: newUl || oldUl,
    ul: String(newRow.ul ?? "").trim() || String(oldRow.ul ?? "").trim(),
    line: String(newRow.line ?? "").trim() || String(oldRow.line ?? "").trim(),
    id: String(newRow.id ?? "").trim() || String(oldRow.id ?? "").trim(),
    qty: newRow.qty ?? oldRow.qty ?? "",
    weight: newRow.weight ?? oldRow.weight ?? "",
    cost: newRow.cost ?? oldRow.cost ?? "",
    seal: String(newRow.seal ?? "").trim() || String(oldRow.seal ?? "").trim(),
  };
}

/** Пересборка из файлов + сохранение перевода, удалённых строк и справочника STOP. */
export function mergeWorkbookOnReprocess(previous: HaulzWorkbook | null, rebuilt: HaulzWorkbook): HaulzWorkbook {
  if (!previous) return rebuilt;

  const excludedUlNumbers = previous.excludedUlNumbers ?? new Set<string>();
  const filteredRebuilt = applyExcludedUlNumbers({ ...rebuilt, excludedUlNumbers });

  const oldItogRows = stripSummaryRows(previous.sheets.find((s) => s.id === "itog")?.rows ?? []);
  const oldByControl = new Map(oldItogRows.map((row) => [itogControlKey(row), row]));
  const keptControlKeys =
    previous.itogControlKeys.size > 0
      ? previous.itogControlKeys
      : new Set(oldItogRows.map((row) => itogControlKey(row)).filter(Boolean));

  const rebuiltItogRows = stripSummaryRows(filteredRebuilt.sheets.find((s) => s.id === "itog")?.rows ?? []);
  const mergedItogRows = rebuiltItogRows
    .filter((row) => {
      const control = itogControlKey(row);
      return !control || keptControlKeys.has(control);
    })
    .map((row) => {
      const old = oldByControl.get(itogControlKey(row));
      return old ? mergeItogRow(old, row) : row;
    });

  let sheets: HaulzSheet[] = filteredRebuilt.sheets.map((sheet) => {
    if (PRESERVE_SHEET_IDS.has(sheet.id)) {
      const prev = previous.sheets.find((s) => s.id === sheet.id);
      return prev ?? sheet;
    }
    if (sheet.id === "itog") {
      return { ...sheet, rows: appendItogSummaryRow(mergedItogRows) };
    }
    if (sheet.id.startsWith("ul-")) {
      const prev = previous.sheets.find((s) => s.id === sheet.id);
      if (prev?.carrierId || prev?.tdNumber) {
        return {
          ...sheet,
          carrierId: prev.carrierId ?? sheet.carrierId,
          tdNumber: prev.tdNumber ?? sheet.tdNumber,
        };
      }
    }
    return sheet;
  });

  for (const prev of previous.sheets) {
    if (prev.id.startsWith("ul-")) {
      const ul = parseUlSheetId(prev.id);
      if (ul && excludedUlNumbers.has(ul)) continue;
      if (prev.ulLocallyEdited) {
        const idx = sheets.findIndex((s) => s.id === prev.id);
        if (idx >= 0) sheets[idx] = prev;
        else sheets.push(prev);
      }
      continue;
    }
    if (!sheets.some((s) => s.id === prev.id)) {
      sheets.push(prev);
    }
  }

  let merged: HaulzWorkbook = recalcWorkbookAfterItogChange({
    sheets,
    itogControlKeys: keptControlKeys,
    excludedUlNumbers,
  });

  const fixIdx = merged.sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = merged.sheets.find((s) => s.id === "itog");
    if (itog) {
      const updated = [...merged.sheets];
      updated[fixIdx] = buildFixSheetFromItog(itog);
      merged = { ...merged, sheets: updated };
    }
  }

  return { ...merged, tdDraft: previous.tdDraft ?? filteredRebuilt.tdDraft, tdPrepared: previous.tdPrepared ?? filteredRebuilt.tdPrepared };
}
