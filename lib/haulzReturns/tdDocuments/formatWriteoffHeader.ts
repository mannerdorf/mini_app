import type { UlWriteoffRow } from "./collectTdRows.js";
import { formatRuDate } from "./defaults.js";
import { extractDraftRuDate } from "./draftDateFields.js";

export type WriteoffHeaderInput = {
  sheetNumber?: number;
  ulNumber: string;
  tdNumber: string;
  rows: UlWriteoffRow[];
  specification?: Record<string, string>;
};

/** Дата из полей спецификации (ВЫВОЗ РАЗРЕШЕН / 02 ФТС). */
export function writeoffDateFromSpecification(specification: Record<string, string> = {}): string {
  return (
    extractDraftRuDate("exportPermit", specification.exportPermit ?? "") ??
    extractDraftRuDate("fts", specification.fts ?? "") ??
    formatRuDate()
  );
}

/** Дата упаковочного листа из заголовка спецификации («… к CMR б/н от DD.MM.YYYY»). */
export function packingListDateFromSpecification(specification: Record<string, string> = {}): string {
  const title = String(specification.title ?? "");
  const cmr = /к\s*CMR\s*б\s*\/?\s*н\s*от\s+(\d{2}\.\d{2}\.\d{4})/i.exec(title);
  if (cmr?.[1]) return cmr[1];
  const first = extractDraftRuDate("title", title);
  if (first) return first;
  return writeoffDateFromSpecification(specification);
}

/** «Калининград (KGD)» из колонки аэропорта первой строки УЛ. */
export function writeoffDestinationFromRows(rows: UlWriteoffRow[]): string {
  for (const row of rows) {
    const airport = String(row.airport ?? "").trim();
    if (airport) return airport;
  }
  return "Калининград (KGD)";
}

export function formatWriteoffTitle(input: WriteoffHeaderInput): string {
  const spec = input.specification ?? {};
  const sheetNo = input.sheetNumber ?? 1;
  const writeoffDate = writeoffDateFromSpecification(spec);
  const ulDate = packingListDateFromSpecification(spec);
  const destination = writeoffDestinationFromRows(input.rows);
  const ulNumber = String(input.ulNumber ?? "").trim();
  return (
    `Дополнительный лист списания №${sheetNo} от ${writeoffDate} ` +
    `к упаковочному листу № ${ulNumber} в ${destination} от ${ulDate}`
  );
}

export function formatWriteoffTdLine(tdNumber: string): string {
  const td = String(tdNumber ?? "").trim();
  if (!td) return "Вывезено по ТД                /";
  const normalized = td.endsWith("/") ? td : `${td}/`;
  return `Вывезено по ТД ${normalized} /`;
}

/** Вторая строка листа списания — номер ТД из шапки спецификации. */
export function formatWriteoffTdLineFromSpecification(
  specification: Record<string, string> = {},
  fallbackTd = "",
): string {
  const headerTd = String(specification.headerTd ?? "").trim() || String(fallbackTd ?? "").trim();
  return formatWriteoffTdLine(headerTd);
}
