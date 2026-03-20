/**
 * Номер «Перевозка HAULZ» в Excel часто приходит как number — пропадают ведущие нули.
 * Логика совпадает с api/lib/wbPerevozkaDigits.ts (фронт не импортирует api).
 */
const DEFAULT_MIN_DIGITS = 9;

export function normalizeWbPerevozkaHaulzDigits(raw: string, minDigits: number = DEFAULT_MIN_DIGITS): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/^\d+$/.test(s)) return s;
  if (s.length >= minDigits) return s;
  return s.padStart(minDigits, "0");
}
