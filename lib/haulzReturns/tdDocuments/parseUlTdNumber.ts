/** Сегмент DDMMYY из номера ТД → DD.MM.YYYY. */
export function tdDateSegmentToRu(segment: string): string | null {
  const s = String(segment ?? "").trim();
  if (!/^\d{6}$/.test(s)) return null;
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yy = s.slice(4, 6);
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return `${dd}.${mm}.${year}`;
}

/** DD.MM.YYYY → сегмент DDMMYY для номера ТД. */
export function ruDateToTdDateSegment(ru: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(ru ?? "").trim());
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]!.slice(-2)}`;
}

export type ParsedUlTdNumber = {
  head: string;
  dateRu: string;
  tail: string;
};

/** «10229010/280426/0113288» → head, dateRu, tail. */
export function parseUlTdNumber(raw: string): ParsedUlTdNumber {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { head: "", dateRu: "", tail: "" };
  const parts = trimmed.split("/").map((p) => p.trim());
  if (parts.length >= 3) {
    const dateRu = tdDateSegmentToRu(parts[1]!) ?? "";
    return {
      head: parts[0] ?? "",
      dateRu,
      tail: parts.slice(2).join("/"),
    };
  }
  if (parts.length === 2) {
    return { head: parts[0] ?? "", dateRu: "", tail: parts[1] ?? "" };
  }
  return { head: trimmed, dateRu: "", tail: "" };
}

/** Номер без даты для поля ввода: head/tail. */
export function formatUlTdNumberWithoutDate(head: string, tail: string): string {
  const h = head.trim();
  const t = tail.trim();
  if (h && t) return `${h}/${t}`;
  return h || t;
}

export function composeUlTdNumber(head: string, dateRu: string, tail: string): string {
  const h = head.trim();
  const t = tail.trim();
  const seg = ruDateToTdDateSegment(dateRu);
  if (!h && !seg && !t) return "";
  if (seg) {
    if (h && t) return `${h}/${seg}/${t}`;
    if (h) return `${h}/${seg}`;
    if (t) return `/${seg}/${t}`;
    return `/${seg}`;
  }
  return formatUlTdNumberWithoutDate(h, t);
}

/** Дата УЛ — только сохранённое поле tdDate (не из сегмента номера ТД). */
export function resolveUlTdDateRu(_tdNumber: string | null | undefined, tdDate: string | null | undefined): string {
  return String(tdDate ?? "").trim();
}

/** Нормализация метаданных УЛ: дата УЛ не выводится из номера ТД. */
export function normalizeUlSheetTdMeta<T extends {
  id?: string;
  tdNumber?: string | null;
  tdDate?: string | null;
}>(sheet: T): T {
  return sheet;
}

export function workbookNeedsUlTdDateBackfill(_workbook: {
  sheets: Array<{ id?: string; tdNumber?: string | null; tdDate?: string | null }>;
}): boolean {
  return false;
}

export function normalizeWorkbookUlTdDates<T extends {
  sheets: Array<{ id?: string; tdNumber?: string | null; tdDate?: string | null }>;
}>(workbook: T): T {
  return workbook;
}

/** Номер и дата УЛ для шапки листа списания. */
export function ulSheetWriteoffMeta(sheet: {
  id: string;
  name?: string | null;
  tdNumber?: string | null;
  tdDate?: string | null;
}): { ulNumber: string; ulDate: string } {
  const idUl = sheet.id.startsWith("ul-") ? sheet.id.slice(3).trim() : "";
  const ulNumber = String(sheet.name ?? "").trim() || idUl;
  const ulDate = resolveUlTdDateRu(sheet.tdNumber, sheet.tdDate);
  return { ulNumber, ulDate };
}
