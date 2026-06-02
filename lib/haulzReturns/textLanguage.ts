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
