/** Минимальная длина номера перевозки для 1С GetFile (ведущие нули). */
export const WB_PEREVOZKA_HAULZ_MIN_DIGITS = 9;

/**
 * Excel/JSON часто отдают номер как число → в строке нет ведущих нулей.
 * Только строки из одних цифр; иначе возвращаем как есть.
 */
export function normalizeWbPerevozkaHaulzDigits(
  raw: string,
  minDigits: number = WB_PEREVOZKA_HAULZ_MIN_DIGITS,
): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!/^\d+$/.test(s)) return s;
  if (s.length >= minDigits) return s;
  return s.padStart(minDigits, "0");
}
