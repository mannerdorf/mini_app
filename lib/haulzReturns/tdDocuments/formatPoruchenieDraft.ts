import { formatRuDate } from "./defaults.js";
import { extractDraftRuDate } from "./draftDateFields.js";
import type { PoruchenieUlDraft } from "./types.js";
import type { UlWriteoffRow } from "./collectTdRows.js";

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export function defaultPoruchenieDate(specification: Record<string, string> = {}): string {
  return extractDraftRuDate("fts", specification.fts ?? "") ?? formatRuDate();
}

export function defaultPoruchenieContractNumber(): string {
  return "01/26";
}

export function defaultPoruchenieContractDate(specification: Record<string, string> = {}): string {
  const ftsDate = extractDraftRuDate("fts", specification.fts ?? "");
  const year = ftsDate?.split(".")[2];
  return year ? `01.01.${year}` : "01.01.2026";
}

export function formatPoruchenieProseDate(ruDate: string): string {
  const [dd = "01", mm = "01", yyyy = "2026"] = ruDate.split(".");
  const day = String(Number(dd));
  const monthName = MONTHS_GENITIVE[Math.max(0, Math.min(11, Number(mm) - 1))] ?? "января";
  return `${day} ${monthName} ${yyyy} г.`;
}

export type PoruchenieHeaderDraft = {
  number: string;
  date: string;
  contractNumber: string;
  contractDate: string;
};

/** Номер, дата поручения и реквизиты агентского договора — из черновика или по умолчанию. */
export function resolvePoruchenieUlDraft(
  specification: Record<string, string>,
  writeoffNumber: number,
  stored?: PoruchenieUlDraft,
): PoruchenieHeaderDraft {
  const defaultDate = defaultPoruchenieDate(specification);
  const defaultContractDate = defaultPoruchenieContractDate(specification);
  const number = String(stored?.number ?? writeoffNumber).trim() || String(writeoffNumber);
  const date = String(stored?.date ?? defaultDate).trim() || defaultDate;
  const contractNumber =
    String(stored?.contractNumber ?? defaultPoruchenieContractNumber()).trim() ||
    defaultPoruchenieContractNumber();
  const contractDate =
    String(stored?.contractDate ?? defaultContractDate).trim() || defaultContractDate;
  return { number, date, contractNumber, contractDate };
}

export function formatPoruchenieTitleLine(header: Pick<PoruchenieHeaderDraft, "number" | "date">): string {
  return `ПОРУЧЕНИЕ № ${header.number} от ${header.date}`;
}

export function formatPoruchenieCityLine(header: Pick<PoruchenieHeaderDraft, "date">): string {
  return `г. Калининград · ${formatPoruchenieProseDate(header.date)}`;
}

export function formatPoruchenieContractLine(
  header: Pick<PoruchenieHeaderDraft, "contractNumber" | "contractDate">,
): string {
  return `агентскому договору № ${header.contractNumber} от ${header.contractDate}`;
}

export function formatPoruchenieCityLineExcel(date: string): string {
  return `г. Калининград      ${formatPoruchenieProseDate(date)}`;
}

export function carrierQuotedName(name: string): string {
  const m = name.match(/[«"]([^»"]+)[»"]/);
  if (m?.[1]) return m[1].trim();
  return name.replace(/^ООО\s+/i, "").trim();
}

export function formatPorucheniePreamble(input: {
  assignmentNumber: string;
  contractNumber: string;
  contractDate: string;
  carrierName: string;
}): string {
  const principal = carrierQuotedName(input.carrierName);
  const num = input.assignmentNumber.trim() || "1";
  const contract = input.contractNumber.trim() || "01/26";
  const contractDate = input.contractDate.trim() || "01.01.2026";
  return (
    `Общество с ограниченной ответственностью «ХОЛЗ», именуемое в дальнейшем " Агент", в лице Генерального директора Слободчикова Анатолия Вячеславовича, действующею на основании Устава, с одной стороны, и ` +
    `Общество с ограниченной ответственностью «${principal}», именуемое в дальнейшем "Принципал", в лице Генерального директора Мандрова Александра Анатольевича, действующего на основании Устава, с другой стороны ` +
    `вместе именуемые Стороны, а индивидуально – Сторона, заключили настоящее поручение №${num} к агентскому договору № ${contract} от ${contractDate} г. о нижеследующем:\n\n` +
    `В рамках агентского договора № ${contract} от ${contractDate} г. Принципал поручает Агенту осуществить юридические и иные действия по следующим товарам:`
  );
}

export function formatPoruchenieFooterIntro(): string {
  return (
    "Настоящее поручение вступает с момента его подписания Сторонами и составлено в двух экземплярах: по одному для каждой из сторон."
  );
}

export function formatPoruchenieFooterSignatoryHolz(): string {
  return "Генеральный директор «ХОЛЗ»                          ______________________/Слободчиков А.В./";
}

export function formatPoruchenieFooterSignatoryCarrier(carrierName: string): string {
  const principal = carrierQuotedName(carrierName);
  return `Генеральный директор ООО «${principal}»              _____________________/Мандров А.А./`;
}

/** @deprecated Используйте отдельные строки footer в buildPoruchenie. */
export function formatPoruchenieFooter(): string {
  return (
    `${formatPoruchenieFooterIntro()}\n\n` +
    `${formatPoruchenieFooterSignatoryHolz()}\n` +
    formatPoruchenieFooterSignatoryCarrier("Геологистика")
  );
}

/** Ключ черновика шапки поручения (общие дата и договор для всех листов). */
export const PORUCHENIE_MERGED_DRAFT_KEY = "__merged__";

function parseAssignmentNumber(value: string | undefined): number | null {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Базовый номер поручения — с первой вкладки (или общего черновика). */
export function resolvePoruchenieBaseAssignmentNumber(
  poruchenie: Record<string, PoruchenieUlDraft> | undefined,
  firstUlNumber: string,
  defaultWriteoffNumber: number,
): number {
  if (!poruchenie) return defaultWriteoffNumber;
  const first = poruchenie[firstUlNumber];
  const merged = poruchenie[PORUCHENIE_MERGED_DRAFT_KEY];
  return (
    parseAssignmentNumber(first?.number) ??
    parseAssignmentNumber(merged?.number) ??
    defaultWriteoffNumber
  );
}

/** Сквозная нумерация: первая вкладка = base, следующая = base + 1, … */
export function resolvePoruchenieAssignmentNumber(base: number, index: number): string {
  return String(base + index);
}

export function resolvePoruchenieSharedHeaderDraft(
  poruchenie: Record<string, PoruchenieUlDraft> | undefined,
  firstUlNumber: string,
): PoruchenieUlDraft | undefined {
  if (!poruchenie) return undefined;
  const merged = poruchenie[PORUCHENIE_MERGED_DRAFT_KEY];
  const first = poruchenie[firstUlNumber];
  if (!merged && !first) return undefined;
  return { ...merged, ...first, number: undefined };
}

export function renumberPoruchenieRows(rows: UlWriteoffRow[]): UlWriteoffRow[] {
  return rows.map((row, index) => ({ ...row, num: index + 1 }));
}

/** Последовательно склеивает строки всех листов списания с новой нумерацией №. */
export function mergePoruchenieWriteoffRows(
  writeoffs: Array<{ rows: UlWriteoffRow[] }>,
): UlWriteoffRow[] {
  const merged: UlWriteoffRow[] = [];
  for (const wo of writeoffs) {
    merged.push(...wo.rows);
  }
  return renumberPoruchenieRows(merged);
}

export function resolveStoredPoruchenieDraft(
  poruchenie: Record<string, PoruchenieUlDraft> | undefined,
  carrierId: string,
  ulNumbers: string[],
): PoruchenieUlDraft | undefined {
  if (!poruchenie) return undefined;
  const merged = poruchenie[PORUCHENIE_MERGED_DRAFT_KEY];
  if (merged) return merged;
  const byCarrier = poruchenie[carrierId];
  if (byCarrier) return byCarrier;
  for (const ul of ulNumbers) {
    const draft = poruchenie[ul];
    if (draft && (draft.number || draft.date || draft.contractNumber || draft.contractDate)) {
      return draft;
    }
  }
  return undefined;
}
