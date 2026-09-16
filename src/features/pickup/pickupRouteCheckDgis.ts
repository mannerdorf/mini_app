/** Сообщения, связанные с вызовом 2ГИС (остальное — вместимость, окна, смена). */
export function isDgisRouteCheckWarning(text: string): boolean {
  if (/2\s?гис/i.test(text)) return true;
  if (text.includes("Ключ 2ГИС")) return true;
  if (text.includes("Расчёт 2ГИС")) return true;
  if (text.startsWith("Адрес не найден однозначно")) return true;
  if (text.startsWith("Точка далеко от выбранного города")) return true;
  if (text.includes("геометри") && text.includes("2ГИС")) return true;
  if (text.includes("Не удалось подтвердить геометрию")) return true;
  return false;
}

export function dgisRouteCheckWarnings(warnings: string[]): string[] {
  return warnings.filter(isDgisRouteCheckWarning);
}
