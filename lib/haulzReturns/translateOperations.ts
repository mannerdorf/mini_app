import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { ensureItogRowIds, itogRowTranslateKey } from "./itogRowKeys.js";
import { appendItogSummaryRow, isSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog } from "./workbookRecalc.js";
import { translateProductNamesEnToRu } from "./openaiTranslate.js";
import { resolveOpenaiApiKey } from "./openaiEnv.js";

export type ItogTranslateItem = {
  rowKey: string;
  text: string;
};

export { ensureItogRowIds, itogRowTranslateKey } from "./itogRowKeys.js";

export function itogRowsNeedingTranslation(rows: HaulzSheetRow[]): ItogTranslateItem[] {
  return ensureItogRowIds(rows)
    .filter((row) => {
      const text = String(row.ulData ?? "").trim();
      const translate = String(row.translate ?? "").trim();
      return text.length > 0 && translate.length === 0;
    })
    .map((row) => ({
      rowKey: itogRowTranslateKey(row),
      text: String(row.ulData ?? "").trim(),
    }))
    .filter((item) => item.rowKey.length > 0);
}

export function applyItogTranslations(sheet: HaulzSheet, translations: Map<string, string>): HaulzSheet {
  if (sheet.id !== "itog" || translations.size === 0) return sheet;

  const dataRows = ensureItogRowIds(stripSummaryRows(sheet.rows)).map((row) => {
    const key = itogRowTranslateKey(row);
    const translation = translations.get(key);
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

const TRANSLATE_BATCH_SIZE = 40;

/** Переводит пустые ячейки «Перевод» на листе итог (сервер, OPENAI_API_KEY). */
export async function translateItogWorkbook(wb: HaulzWorkbook): Promise<HaulzWorkbook> {
  if (!resolveOpenaiApiKey()) return wb;

  const itog = wb.sheets.find((s) => s.id === "itog");
  if (!itog) return wb;

  const pending = itogRowsNeedingTranslation(itog.rows);
  if (pending.length === 0) return wb;

  let current = wb;
  for (let i = 0; i < pending.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRANSLATE_BATCH_SIZE);
    const translations = await translateProductNamesEnToRu(batch.map((item) => item.text));
    const map = new Map<string, string>();
    batch.forEach((item, idx) => {
      const text = String(translations[idx] ?? "").trim();
      if (text) map.set(item.rowKey, text);
    });
    current = applyItogTranslationsToWorkbook(current, map);
  }

  return current;
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
