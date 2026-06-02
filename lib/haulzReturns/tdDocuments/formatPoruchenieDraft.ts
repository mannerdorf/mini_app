import { formatRuDate } from "./defaults.js";
import { extractDraftRuDate } from "./draftDateFields.js";
import type { PoruchenieUlDraft } from "./types.js";

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
