import { formatRuDate } from "./defaults.js";
import { extractDraftRuDate } from "./draftDateFields.js";

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function transliterateFilename(name: string): string {
  if (!name) return "";
  let out = "";
  for (let i = 0; i < name.length; i++) {
    const c = name[i]!;
    const lower = c.toLowerCase();
    const t = TRANSLIT[lower];
    if (t !== undefined) {
      out += c === c.toUpperCase() && c !== lower ? t.charAt(0).toUpperCase() + t.slice(1) : t;
    } else {
      out += c;
    }
  }
  return out;
}

/** Безопасное имя файла: транслит заголовка + расширение. */
export function tdExportFileNameFromTitle(title: string, ext: string): string {
  const raw = title.trim() || "document";
  const translit = transliterateFilename(raw)
    .replace(/№/g, "No")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const base = translit.replace(/\.+$/g, "").trim() || "document";
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  return `${base}${suffix}`;
}

export function specificationExportFileName(title: string): string {
  return tdExportFileNameFromTitle(title, ".xlsx");
}

export function proformaExportFileName(title: string): string {
  return tdExportFileNameFromTitle(title, ".xlsx");
}

export function parseSpecificationTitleMeta(title: string): { number: string; date: string } {
  const trimmed = title.trim();
  const numMatch =
    /(?:Спецификация|спецификации)\s*№\s*(\d+)/i.exec(trimmed) ?? /№\s*(\d+)/i.exec(trimmed);
  const number = numMatch?.[1]?.trim() || "1";
  const date = extractDraftRuDate("title", trimmed) ?? formatRuDate();
  return { number, date };
}

/** «ПОРУЧЕНИЕ № N от DD.MM.YYYY.xlsx» в транслите. */
export function poruchenieExportFileName(assignmentNumber: string, date: string): string {
  const num = assignmentNumber.trim() || "1";
  const ruDate = date.trim() || formatRuDate();
  return tdExportFileNameFromTitle(`Поручение №${num} от ${ruDate}`, ".xlsx");
}

/** «Листы списания к спецификации №N от DD.MM.YYYY.xlsx» в транслите. */
export function writeoffExportFileName(specificationTitle: string): string {
  const { number, date } = parseSpecificationTitleMeta(specificationTitle);
  return tdExportFileNameFromTitle(`Листы списания к спецификации №${number} от ${date}`, ".xlsx");
}
