import { isRussianOnlyText, itogTextNeedsTranslation, translationLooksSuccessful } from "../haulzReturns/textLanguage.js";

/** Отделяет артикул/код в начале («0460 …») от переводимой части. */
export function splitProductNamePrefix(name: string): { prefix: string; core: string } {
  const trimmed = name.trim();
  if (!trimmed) return { prefix: "", core: "" };
  const match = trimmed.match(/^([\d][\d./\-]*\s+)(.+)$/);
  if (match && itogTextNeedsTranslation(match[2])) {
    return { prefix: match[1], core: match[2].trim() };
  }
  return { prefix: "", core: trimmed };
}

/** Ключ для словаря переводов: ядро без артикула или полная строка. */
export function productNameTranslationKey(name: string): string {
  const { core } = splitProductNamePrefix(name);
  return core || name.trim();
}

export function applyProductNameTranslation(name: string, translations: Map<string, string>): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (isRussianOnlyText(trimmed)) return trimmed;

  const { prefix, core } = splitProductNamePrefix(trimmed);
  const translatedCore =
    translations.get(core) ?? translations.get(trimmed) ?? core;
  const merged = prefix ? `${prefix}${translatedCore}`.trim() : translatedCore;

  if (translationLooksSuccessful(trimmed, merged)) return merged;
  if (translationLooksSuccessful(core, translatedCore)) {
    return prefix ? `${prefix}${translatedCore}`.trim() : translatedCore;
  }
  return merged;
}

export function collectUniqueProductNameTranslationKeys(names: string[]): string[] {
  const keys = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || isRussianOnlyText(trimmed)) continue;
    if (!itogTextNeedsTranslation(trimmed)) continue;
    keys.add(productNameTranslationKey(trimmed));
  }
  return [...keys];
}
