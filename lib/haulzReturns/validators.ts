import { lookupStopExact, lookupStopFromRows } from "./stopWords";
import type { HaulzSheetRow } from "./types";

const PINK_LIST_REGEX =
  /личн.*вещ|докум|пуст.*бутыл|бутыл|пакет|конверт|товар.*интернет.*магазин|товар.*подмен|прилож.*опис|опис|карт|вино|игрист|брют|розе|рислинг|зект|нипоццано|ле гран нуар|ханс баер|document|товар.*народ.*потребл|одежд|sim[- ]*карт|не *указан|other|device|tools|橡皮绑带|case|друг|ruler|clothes|connector|pendants|stickers|fittings|bangles|bracelets|lockparts|renault|printers/i;

export function isEnglishOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return !/[А-Яа-яЁё]/.test(t);
}

export function hasAu585OrAg925(text: string): boolean {
  const u = text.toUpperCase();
  return /AU\s*585/.test(u) || /AG\s*925/.test(u);
}

export function isDigitsOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^[0-9]+$/.test(t);
}

export function isPinkListMatch(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return PINK_LIST_REGEX.test(t);
}

export function stopColumnValue(ulData: string, stopRows?: HaulzSheetRow[]): string {
  if (stopRows?.length) return lookupStopFromRows(ulData, stopRows);
  return lookupStopExact(ulData);
}

export function countUlPlaces(rows: { ul: string; id: string }[], ul: string): number {
  const unique = new Set<string>();
  let emptyCount = 0;
  for (const row of rows) {
    if (row.ul !== ul) continue;
    const id = row.id ?? "";
    if (!id) emptyCount++;
    else unique.add(id);
  }
  return unique.size + emptyCount;
}

export type ItogValidation = {
  englishOnly: boolean;
  au585: boolean;
  digitsOnly: boolean;
  pinkList: boolean;
};

export function validateItogRow(ulData: string): ItogValidation {
  return {
    englishOnly: isEnglishOnly(ulData),
    au585: hasAu585OrAg925(ulData),
    digitsOnly: isDigitsOnly(ulData),
    pinkList: isPinkListMatch(ulData),
  };
}

/** Флаги подсветки из строки итог/FIX (или пересчёт по ulData). */
export function itogValidationFromRow(row: HaulzSheetRow): ItogValidation {
  const hasFlags =
    row.englishOnly !== undefined ||
    row.au585 !== undefined ||
    row.digitsOnly !== undefined ||
    row.pinkList !== undefined;
  if (hasFlags) {
    return {
      englishOnly: Boolean(row.englishOnly),
      au585: Boolean(row.au585),
      digitsOnly: Boolean(row.digitsOnly),
      pinkList: Boolean(row.pinkList),
    };
  }
  return validateItogRow(String(row.ulData ?? ""));
}

/** Цвета условного форматирования итог */
export function itogRowHighlight(v: ItogValidation): string | null {
  if (v.au585) return "#D9EAD2";
  if (v.englishOnly) return "#FFF1CC";
  return null;
}

export function itogUlDataHighlight(v: ItogValidation): string | null {
  if (v.pinkList) return "#F6DCE6";
  if (v.digitsOnly) return "#D9EAD2";
  if (v.englishOnly) return "#FFF1CC";
  return null;
}

export const UL_HIGHLIGHT = "#B7E1CD";
