import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { appendItogSummaryRow, isSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog } from "./workbookRecalc.js";

export type ItogTranslateItem = {
  rowId: string;
  text: string;
};

export function itogRowsNeedingTranslation(rows: HaulzSheetRow[]): ItogTranslateItem[] {
  return stripSummaryRows(rows)
    .filter((row) => {
      const text = String(row.ulData ?? "").trim();
      const translate = String(row.translate ?? "").trim();
      return text.length > 0 && translate.length === 0;
    })
    .map((row) => ({
      rowId: String(row._rowId ?? ""),
      text: String(row.ulData ?? "").trim(),
    }))
    .filter((item) => item.rowId.length > 0);
}

export function applyItogTranslations(sheet: HaulzSheet, translations: Map<string, string>): HaulzSheet {
  if (sheet.id !== "itog" || translations.size === 0) return sheet;

  const dataRows = stripSummaryRows(sheet.rows).map((row) => {
    const rowId = String(row._rowId ?? "");
    const translation = translations.get(rowId);
    if (translation == null) return row;
    return { ...row, translate: translation };
  });

  return { ...sheet, rows: appendItogSummaryRow(dataRows) };
}

export function applyItogTranslationsToWorkbook(
  workbook: HaulzWorkbook,
  translations: Map<string, string>,
): HaulzWorkbook {
  if (translations.size === 0) return workbook;

  let sheets = workbook.sheets.map((sheet) =>
    sheet.id === "itog" ? applyItogTranslations(sheet, translations) : sheet,
  );

  const fixIdx = sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    const itog = sheets.find((s) => s.id === "itog");
    if (itog) {
      sheets = [...sheets];
      sheets[fixIdx] = buildFixSheetFromItog(itog);
    }
  }

  return { ...workbook, sheets };
}

/** Сколько строк итога уже имеют перевод (без суммирующей строки). */
export function countItogTranslatedRows(rows: HaulzSheetRow[]): number {
  return stripSummaryRows(rows).filter((row) => String(row.translate ?? "").trim().length > 0).length;
}

export function isItogTranslatePendingRow(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return false;
  const text = String(row.ulData ?? "").trim();
  const translate = String(row.translate ?? "").trim();
  return text.length > 0 && translate.length === 0;
}
