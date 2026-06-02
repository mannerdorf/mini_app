import fs from "node:fs";
import type { UlWriteoffRow } from "./collectTdRows.js";
import type { PoruchenieInput } from "./types.js";
import { formatRuDate } from "./defaults.js";
import { templatePath } from "./excelUtils.js";

export type { PoruchenieInput } from "./types.js";

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function carrierQuotedName(name: string): string {
  const m = name.match(/[«"]([^»"]+)[»"]/);
  if (m?.[1]) return m[1].trim();
  return name.replace(/^ООО\s+/i, "").trim();
}

export function carrierShortLabel(name: string): string {
  const core = carrierQuotedName(name);
  if (core.length <= 4) return core;
  return core.slice(0, 3);
}

function formatDocWeight(v: string | number): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(".", ",");
}

function formatDocMoney(v: string | number): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(".", ",");
}

function splitDottedDateParts(isoLike: string): string[] {
  const [dd = "01", mm = "01", yyyy = "2026"] = isoLike.split(".");
  const day = dd.padStart(2, "0");
  const month = mm.padStart(2, "0");
  const year = yyyy.padStart(4, "0");
  const dayParts = day.length === 2 ? [day[0]!, day[1]!] : [day];
  return [...dayParts, ".", month, `.20${year[2]!}`, year[3]!];
}

function splitProseDateParts(isoLike: string): string[] {
  const [dd = "01", mm = "01", yyyy = "2026"] = isoLike.split(".");
  const day = String(Number(dd));
  const dayParts = day.length === 2 ? [day[0]!, day[1]!] : [day];
  const monthName = MONTHS_GENITIVE[Math.max(0, Math.min(11, Number(mm) - 1))] ?? "января";
  const yearPrefix = yyyy.slice(0, 3);
  const yearSuffix = yyyy.slice(3);
  return [...dayParts, " ", monthName, ` ${yearPrefix}`, yearSuffix, " г."];
}

function splitContractNumberParts(contractNumber: string): string[] {
  const m = /^(\d+)\/(\d+)$/.exec(contractNumber.trim());
  if (!m) return [` ${contractNumber.trim()}`];
  const left = m[1]!.padStart(2, "0");
  const right = m[2]!;
  if (right.length === 2) return [` ${left}`, `/${right[0]}`, right[1]!];
  return [` ${left}`, `/${right}`];
}

function splitContractDateParts(isoLike: string): string[] {
  const [dd = "01", mm = "01", yyyy = "2026"] = isoLike.split(".");
  const day = dd.padStart(2, "0");
  const month = mm.padStart(2, "0");
  return [day, `.${month[0]}`, month[1]!, `.${yyyy.slice(0, 3)}`, `${yyyy[3]} г.`];
}

function skipWhitespaceTextNodes(xml: string, startIndex: number): number {
  const re = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
  re.lastIndex = startIndex;
  let cursor = startIndex;
  for (;;) {
    const m = re.exec(xml);
    if (!m || m.index === undefined) break;
    if ((m[2] ?? "").trim() === "") {
      cursor = m.index + m[0].length;
      re.lastIndex = cursor;
      continue;
    }
    break;
  }
  return cursor;
}

function replacePartsFromCursor(xml: string, cursor: number, parts: string[]): { xml: string; endIndex: number } {
  let out = xml;
  let pos = cursor;
  for (const part of parts) {
    const next = replaceNextTextNode(out, pos, part);
    out = next.xml;
    pos = next.endIndex;
  }
  return { xml: out, endIndex: pos };
}

function replaceNextTextNode(xml: string, startIndex: number, newText: string): { xml: string; endIndex: number } {
  const re = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
  re.lastIndex = startIndex;
  const m = re.exec(xml);
  if (!m || m.index === undefined) return { xml, endIndex: startIndex };
  const attrs = m[1] ?? "";
  const preserve = /^\s|\s$/.test(newText) ? ' xml:space="preserve"' : "";
  const next = `<w:t${attrs || preserve}>${escapeXml(newText)}</w:t>`;
  return {
    xml: xml.slice(0, m.index) + next + xml.slice(m.index + m[0].length),
    endIndex: m.index + next.length,
  };
}

function replaceSequenceAfterAnchor(xml: string, anchor: string, parts: string[]): string {
  const pos = xml.indexOf(anchor);
  if (pos === -1) return xml;
  let cursor = pos + anchor.length;
  let out = xml;
  for (const part of parts) {
    const next = replaceNextTextNode(out, cursor, part);
    out = next.xml;
    cursor = next.endIndex;
  }
  return out;
}

function replacePoruchenieNumbers(xml: string, assignmentNumber: string): string {
  const n = assignmentNumber.trim() || "1";
  let out = replaceSequenceAfterAnchor(xml, "ПОРУЧЕНИЕ №", [" ", n]);
  out = replaceSequenceAfterAnchor(out, "заключили настоящее поручение №", [n]);
  return out;
}

function replacePoruchenieDates(xml: string, ruDate: string): string {
  let out = xml;
  const titlePos = out.indexOf("ПОРУЧЕНИЕ №");
  if (titlePos !== -1) {
    const afterNum = out.indexOf(" от ", titlePos);
    if (afterNum !== -1) {
      let cursor = afterNum + " от ".length;
      for (const part of splitDottedDateParts(ruDate)) {
        const next = replaceNextTextNode(out, cursor, part);
        out = next.xml;
        cursor = next.endIndex;
      }
    }
  }

  const proseAnchor = "г. Калининград";
  const prosePos = out.indexOf(proseAnchor);
  if (prosePos !== -1) {
    const cursor = skipWhitespaceTextNodes(out, prosePos + proseAnchor.length);
    out = replacePartsFromCursor(out, cursor, splitProseDateParts(ruDate)).xml;
  }
  return out;
}

function replaceContractBlock(
  xml: string,
  anchor: string,
  skipNoSign: boolean,
  contractNumber: string,
  contractDate: string,
): string {
  const pos = xml.indexOf(anchor);
  if (pos === -1) return xml;
  let cursor = pos + anchor.length;
  if (skipNoSign) {
    const re = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
    re.lastIndex = cursor;
    const m = re.exec(xml);
    if (m && (m[2] ?? "").trim() === "№") {
      cursor = m.index + m[0].length;
    }
  }
  let out = replacePartsFromCursor(xml, cursor, splitContractNumberParts(contractNumber)).xml;
  cursor = out.indexOf(" от ", pos);
  if (cursor === -1) return out;
  cursor += " от ".length;
  return replacePartsFromCursor(out, cursor, splitContractDateParts(contractDate)).xml;
}

function replacePoruchenieContract(xml: string, contractNumber: string, contractDate: string): string {
  let out = replaceContractBlock(xml, " к агентскому договору\u00a0№", false, contractNumber, contractDate);
  out = replaceContractBlock(out, "В рамках агентского договора ", true, contractNumber, contractDate);
  return out;
}

const PORUCHENIE_FOOTER_ANCHOR = "Настоящее поручение вступает";

function replacePrincipalNameInSection(xml: string, carrierName: string): string {
  const quoted = carrierQuotedName(carrierName);
  return xml
    .replace(/«Геологистика»/g, `«${quoted}»`)
    .replace(/ООО « Геологистика »/g, `ООО « ${quoted} »`)
    .replace(/Геологистика/g, quoted);
}

/** Имя перевозчика — только в преамбуле; подписи в конце документа не меняются. */
function replacePrincipalName(xml: string, carrierName: string): string {
  const footerPos = xml.indexOf(PORUCHENIE_FOOTER_ANCHOR);
  if (footerPos === -1) return replacePrincipalNameInSection(xml, carrierName);
  const head = xml.slice(0, footerPos);
  const tail = xml.slice(footerPos);
  return replacePrincipalNameInSection(head, carrierName) + tail;
}

function setCellText(cellXml: string, text: string): string {
  const safe = escapeXml(text);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  let used = false;
  return cellXml.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/g, (_full, attrs: string) => {
    if (used) return "<w:t></w:t>";
    used = true;
    return `<w:t${attrs || preserve}>${safe}</w:t>`;
  });
}

function buildDataRow(templateRow: string, row: UlWriteoffRow): string {
  const cellRe = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
  const cells = [...templateRow.matchAll(cellRe)].map((m) => m[0]);
  const values = [
    String(row.num),
    row.rowNum,
    row.id,
    row.parcel,
    formatDocWeight(row.weight),
    row.name,
    formatDocMoney(row.qty),
    formatDocMoney(row.cost),
  ];
  const newCells = cells.map((cell, i) => setCellText(cell, values[i] ?? ""));
  let idx = 0;
  return templateRow.replace(cellRe, () => newCells[idx++] ?? "");
}

function replaceTableRows(xml: string, rows: UlWriteoffRow[]): string {
  const tblStart = xml.indexOf("<w:tbl>");
  const tblEnd = xml.indexOf("</w:tbl>", tblStart);
  if (tblStart === -1 || tblEnd === -1) throw new Error("В шаблоне поручения нет таблицы");

  const tableXml = xml.slice(tblStart, tblEnd + 8);
  const rowRe = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  const tableRows = [...tableXml.matchAll(rowRe)].map((m) => m[0]);
  if (tableRows.length < 2) throw new Error("В шаблоне поручения нет строк данных");

  const headerRow = tableRows[0]!;
  const templateDataRow = tableRows[1]!;
  const dataRows = rows.map((row) => buildDataRow(templateDataRow, row)).join("");
  const openTagEnd = tableXml.indexOf("<w:tr");
  const tblOpen = tableXml.slice(0, openTagEnd);
  const rebuilt = `${tblOpen}${headerRow}${dataRows}</w:tbl>`;

  return xml.slice(0, tblStart) + rebuilt + xml.slice(tblEnd + 8);
}

export async function buildPoruchenieBuffer(input: PoruchenieInput): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const date = input.date ?? formatRuDate();
  const contractNumber = input.contractNumber?.trim() || "01/26";
  const contractDate = input.contractDate?.trim() || "01.01.2026";
  const buf = fs.readFileSync(templatePath("poruchenie.docx"));
  const zip = new PizZip(buf);
  let xml = zip.file("word/document.xml")?.asText() ?? "";

  xml = replacePrincipalName(xml, input.carrier.name);
  xml = replacePoruchenieNumbers(xml, input.assignmentNumber);
  xml = replacePoruchenieDates(xml, date);
  xml = replacePoruchenieContract(xml, contractNumber, contractDate);
  xml = replaceTableRows(xml, input.rows);

  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer" });
}

export function poruchenieFileName(input: Pick<PoruchenieInput, "ulNumber" | "assignmentNumber" | "carrier">): string {
  const shortName = carrierShortLabel(input.carrier.name);
  const num = input.assignmentNumber.trim() || "1";
  return `${input.ulNumber}_Поручение_Агенту_Холз_${shortName}_${num}.docx`;
}
