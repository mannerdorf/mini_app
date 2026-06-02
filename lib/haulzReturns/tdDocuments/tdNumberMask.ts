import { composeUlTdNumber, parseUlTdNumber, ruDateToTdDateSegment } from "./parseUlTdNumber.js";

export const TD_NUMBER_SEGMENT_LENGTHS = [8, 6, 7] as const;
export const TD_NUMBER_MAX_DIGITS = TD_NUMBER_SEGMENT_LENGTHS.reduce((sum, len) => sum + len, 0);
export const TD_NUMBER_MASK_PLACEHOLDER = "00000000/000000/0000000";

export function tdNumberDigitsOnly(value: string): string {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, TD_NUMBER_MAX_DIGITS);
}

/** Цифры → маска «11216407/160426/0113288». */
export function formatTdNumberMask(digits: string): string {
  const d = tdNumberDigitsOnly(digits);
  if (!d) return "";
  const parts: string[] = [];
  let offset = 0;
  for (const len of TD_NUMBER_SEGMENT_LENGTHS) {
    if (offset >= d.length) break;
    parts.push(d.slice(offset, Math.min(offset + len, d.length)));
    offset += len;
  }
  return parts.join("/");
}

export function formatTdNumberMaskInput(value: string): string {
  return formatTdNumberMask(tdNumberDigitsOnly(value));
}

export function tdNumberToMaskDigits(raw: string): string {
  const parsed = parseUlTdNumber(raw);
  const seg = ruDateToTdDateSegment(parsed.dateRu) ?? "";
  return tdNumberDigitsOnly(`${parsed.head}${seg}${parsed.tail}`);
}

export function formatTdNumberMaskFromParsed(raw: string): string {
  if (!String(raw ?? "").trim()) return "";
  return formatTdNumberMask(tdNumberToMaskDigits(raw));
}

export function applyTdDateToTdNumberMask(currentNumber: string, dateRu: string): string {
  const parsed = parseUlTdNumber(currentNumber);
  const composed = composeUlTdNumber(parsed.head, dateRu, parsed.tail);
  if (!composed) return formatTdNumberMaskInput(currentNumber);
  return formatTdNumberMaskFromParsed(composed);
}
