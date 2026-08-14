export function isEnglishOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return !/[А-Яа-яЁё]/.test(t);
}

/** Только кириллица (и цифры/знаки), без латиницы — перевод не нужен. */
export function isRussianOnlyText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/[А-Яа-яЁё]/.test(t)) return false;
  return !/[A-Za-z]/.test(t);
}

/** Строка нуждается в EN→RU переводе: есть латиница, текст не целиком на русском. */
export function itogTextNeedsTranslation(text: string): boolean {
  const t = text.trim();
  if (!t || isRussianOnlyText(t)) return false;
  return /[A-Za-z]/.test(t);
}

/** Перевод считается успешным, если появилась кириллица или текст заметно изменился на русский. */
export function translationLooksSuccessful(original: string, translated: string): boolean {
  const a = original.trim();
  const b = translated.trim();
  if (!b || b === a) return false;
  if (isRussianOnlyText(b)) return true;
  const cyrA = (a.match(/[А-Яа-яЁё]/g) ?? []).length;
  const cyrB = (b.match(/[А-Яа-яЁё]/g) ?? []).length;
  return cyrB > cyrA;
}
