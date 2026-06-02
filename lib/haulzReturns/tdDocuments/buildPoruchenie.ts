import fs from "node:fs";
import type { UlWriteoffRow } from "./collectTdRows.js";
import type { PoruchenieInput } from "./types.js";
import { formatRuDate } from "./defaults.js";
import { templatePath } from "./excelUtils.js";

export type { PoruchenieInput } from "./types.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsTableXml(rows: UlWriteoffRow[]): string {
  const header =
    "<w:tr><w:tc><w:p><w:r><w:t>№</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>Номер п/п по УЛ</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>ID</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>Посылка</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>Наименование</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>Вес</w:t></w:r></w:p></w:tc>" +
    "<w:tc><w:p><w:r><w:t>Стоимость</w:t></w:r></w:p></w:tc></w:tr>";

  const body = rows
    .map(
      (r) =>
        `<w:tr>` +
        `<w:tc><w:p><w:r><w:t>${r.num}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(r.rowNum)}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(r.id)}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(r.parcel)}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(r.name)}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(String(r.weight))}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${escapeXml(String(r.cost))}</w:t></w:r></w:p></w:tc>` +
        `</w:tr>`,
    )
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${header}${body}</w:tbl>`;
}

export async function buildPoruchenieBuffer(input: PoruchenieInput): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const date = input.date ?? formatRuDate();
  const buf = fs.readFileSync(templatePath("poruchenie.docx"));
  const zip = new PizZip(buf);
  let xml = zip.file("word/document.xml")?.asText() ?? "";

  xml = xml.replace(/(<w:t>)6(<\/w:t>)/, `$1${input.writeoffNumber}$2`);
  xml = xml.replace(/(<w:t xml:space="preserve">) от (<\/w:t>)/, `$1 от ${date}$2`);
  xml = xml.replace(/02612691/g, input.ulNumber);
  xml = xml.replace(/10229010\/280426\//g, `${input.tdNumber} `);

  const carrierBlock =
    `<w:p><w:r><w:t>${escapeXml(input.carrier.name)}</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>ИНН ${escapeXml(input.carrier.inn)} КПП ${escapeXml(input.carrier.kpp)}</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>${escapeXml(input.carrier.legalAddress)}</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Лист списания №${input.writeoffNumber} · УЛ ${escapeXml(input.ulNumber)}</w:t></w:r></w:p>` +
    rowsTableXml(input.rows);

  if (xml.includes("</w:body>")) {
    xml = xml.replace("</w:body>", `${carrierBlock}</w:body>`);
  }

  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer" });
}

export function poruchenieFileName(ulNumber: string): string {
  return `${ulNumber}_Поручение.docx`;
}
