/** Минимальная длина номера перевозки для 1С GetFile (ведущие нули). */
export const WB_PEREVOZKA_HAULZ_MIN_DIGITS = 9;

/** BOM, zero-width, soft hyphen — часто приезжают из Excel/веба перед «000…». */
const INVISIBLE_AND_FORMAT = /[\uFEFF\u200B-\u200D\u2060\u00AD]/g;

/**
 * Убирает невидимые символы и обрезает пробелы (в т.ч. \u00a0, тонкие пробелы по краям).
 */
export function cleanTransportNumberInput(raw: string): string {
  let s = String(raw ?? "").replace(INVISIBLE_AND_FORMAT, "");
  s = s.replace(/^[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]+|[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]+$/g, "");
  return s.trim();
}

/** Только цифры — для нормализации и сравнения с cache_perevozki. */
export function stripToTransportDigits(raw: string): string {
  return cleanTransportNumberInput(raw).replace(/\D/g, "");
}

/**
 * Совпадение номера перевозки в кэше и в запросе: без служебных символов,
 * ведущие нули не важны (126765 === 000126765).
 */
export function transportAccessKeysMatch(cacheNumber: unknown, requestNumber: string): boolean {
  const a = cleanTransportNumberInput(String(cacheNumber ?? ""));
  const b = cleanTransportNumberInput(requestNumber);
  if (a === b) return true;
  const da = stripToTransportDigits(a);
  const db = stripToTransportDigits(b);
  if (!da || !db) return false;
  const na = da.replace(/^0+/, "") || "0";
  const nb = db.replace(/^0+/, "") || "0";
  return na === nb;
}

/**
 * Excel/JSON часто отдают номер как число → в строке нет ведущих нулей.
 * Служебные символы и пробелы между цифрами убираем.
 */
export function normalizeWbPerevozkaHaulzDigits(
  raw: string,
  minDigits: number = WB_PEREVOZKA_HAULZ_MIN_DIGITS,
): string {
  const digits = stripToTransportDigits(raw);
  if (!digits) return cleanTransportNumberInput(raw);
  if (digits.length >= minDigits) return digits;
  return digits.padStart(minDigits, "0");
}
