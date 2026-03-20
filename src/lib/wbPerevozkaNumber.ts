/**
 * Дублирует api/lib/wbPerevozkaDigits.ts (фронт не импортирует api).
 * Убираем BOM/zero-width/NBSP и нормализуем ведущие нули для GetFile.
 */
const DEFAULT_MIN_DIGITS = 9;
const INVISIBLE_AND_FORMAT = /[\uFEFF\u200B-\u200D\u2060\u00AD]/g;

function cleanTransportNumberInput(raw: string): string {
  let s = String(raw ?? "").replace(INVISIBLE_AND_FORMAT, "");
  s = s.replace(/^[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]+|[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]+$/g, "");
  return s.trim();
}

function stripToTransportDigits(raw: string): string {
  return cleanTransportNumberInput(raw).replace(/\D/g, "");
}

export function normalizeWbPerevozkaHaulzDigits(raw: string, minDigits: number = DEFAULT_MIN_DIGITS): string {
  const digits = stripToTransportDigits(raw);
  if (!digits) return cleanTransportNumberInput(raw);
  if (digits.length >= minDigits) return digits;
  return digits.padStart(minDigits, "0");
}
