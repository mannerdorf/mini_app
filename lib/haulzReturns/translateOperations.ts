import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types.js";
import { ensureItogRowIds, itogRowTranslateKey, itogRowTranslationLookupKeys } from "./itogRowKeys.js";
import { appendItogSummaryRow, isSummaryRow, stripSummaryRows } from "./ulTotals.js";
import { buildFixSheetFromItog } from "./workbookRecalc.js";
import { translateProductNamesEnToRu } from "./openaiTranslate.js";
import { resolveOpenaiApiKey } from "./openaiEnv.js";
import { isRussianOnlyText } from "./validators.js";

export type ItogTranslateItem = {
  rowKey: string;
  text: string;
};

export { ensureItogRowIds, itogRowTranslateKey } from "./itogRowKeys.js";

/** Строка нуждается в EN→RU переводе: есть латиница, текст не целиком на русском. */
export function itogTextNeedsTranslation(text: string): boolean {
  const t = text.trim();
  if (!t || isRussianOnlyText(t)) return false;
  return /[A-Za-z]/.test(t);
}

/** Принимаем перевод: EN→RU; для чисто русского источника — только кириллица или копия источника. */
export function acceptItogTranslation(source: string, translation: string): boolean {
  const src = source.trim();
  const tr = translation.trim();
  if (!tr) return false;
  if (isRussianOnlyText(src)) {
    return tr === src || isRussianOnlyText(tr);
  }
  if (!/[A-Za-z]/.test(src)) return tr === src;
  if (/[А-Яа-яЁё]/.test(tr)) return true;
  return tr.toLowerCase() !== src.toLowerCase();
}

/** Для строк с русским «Данные УЛ» копирует текст в «Перевод» (без EN→RU). */
export function syncRussianOnlyItogTranslations(workbook: HaulzWorkbook): { workbook: HaulzWorkbook; changed: boolean } {
  const itogIdx = workbook.sheets.findIndex((s) => s.id === "itog");
  if (itogIdx < 0) return { workbook, changed: false };

  const itog = workbook.sheets[itogIdx]!;
  let changed = false;
  const dataRows = ensureItogRowIds(stripSummaryRows(itog.rows)).map((row) => {
    const source = String(row.ulData ?? "").trim();
    if (!isRussianOnlyText(source)) return row;
    const tr = String(row.translate ?? "").trim();
    if (tr === source) return row;
    changed = true;
    return { ...row, translate: source };
  });

  if (!changed) return { workbook, changed: false };

  const sheets = [...workbook.sheets];
  sheets[itogIdx] = { ...itog, rows: appendItogSummaryRow(dataRows) };

  const fixIdx = sheets.findIndex((s) => s.id === "fix");
  if (fixIdx >= 0) {
    sheets[fixIdx] = buildFixSheetFromItog(sheets[itogIdx]!);
  }

  return { workbook: { ...workbook, sheets }, changed: true };
}

export function itogRowsForTranslation(
  rows: HaulzSheetRow[],
  opts?: { includeFilled?: boolean },
): ItogTranslateItem[] {
  const includeFilled = opts?.includeFilled === true;
  return ensureItogRowIds(rows)
    .filter((row) => {
      const text = String(row.ulData ?? "").trim();
      const translate = String(row.translate ?? "").trim();
      if (!text || !itogTextNeedsTranslation(text)) return false;
      if (includeFilled) return true;
      return translate.length === 0;
    })
    .map((row) => ({
      rowKey: itogRowTranslateKey(row),
      text: String(row.ulData ?? "").trim(),
    }))
    .filter((item) => item.rowKey.length > 0);
}

/** Строки с пустым «Перевод» (автоперевод при загрузке). */
export function itogRowsNeedingTranslation(rows: HaulzSheetRow[]): ItogTranslateItem[] {
  return itogRowsForTranslation(rows);
}

function lookupTranslation(translations: Map<string, string>, row: HaulzSheetRow): string | undefined {
  for (const key of itogRowTranslationLookupKeys(row)) {
    const hit = translations.get(key);
    if (hit?.trim()) return hit.trim();
  }
  return undefined;
}

export function applyItogTranslations(sheet: HaulzSheet, translations: Map<string, string>): HaulzSheet {
  if (sheet.id !== "itog" || translations.size === 0) return sheet;

  const dataRows = ensureItogRowIds(stripSummaryRows(sheet.rows)).map((row) => {
    const source = String(row.ulData ?? "").trim();
    if (isRussianOnlyText(source)) {
      return { ...row, translate: source };
    }
    const translation = lookupTranslation(translations, row);
    if (translation == null || !acceptItogTranslation(source, translation)) return row;
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
  let current = syncRussianOnlyItogTranslations(wb).workbook;
  if (!resolveOpenaiApiKey()) return current;

  const itog = current.sheets.find((s) => s.id === "itog");
  if (!itog) return current;

  const pending = itogRowsNeedingTranslation(itog.rows);
  if (pending.length === 0) return current;

  for (let i = 0; i < pending.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRANSLATE_BATCH_SIZE);
    const translations = await translateProductNamesEnToRu(batch.map((item) => item.text));
    const map = new Map<string, string>();
    batch.forEach((item, idx) => {
      const text = String(translations[idx] ?? "").trim();
      if (text && acceptItogTranslation(item.text, text)) map.set(item.rowKey, text);
    });
    current = applyItogTranslationsToWorkbook(current, map);
  }

  return syncRussianOnlyItogTranslations(current).workbook;
}

/** Сколько строк итога уже имеют перевод (без суммирующей строки). */
export function countItogTranslatedRows(rows: HaulzSheetRow[]): number {
  return stripSummaryRows(rows).filter((row) => String(row.translate ?? "").trim().length > 0).length;
}

export function isItogTranslatePendingRow(row: HaulzSheetRow): boolean {
  if (isSummaryRow(row)) return false;
  const text = String(row.ulData ?? "").trim();
  const translate = String(row.translate ?? "").trim();
  return text.length > 0 && translate.length === 0 && itogTextNeedsTranslation(text);
}
