import type { HaulzCarrier } from "../carriers.js";
import type { HaulzWorkbook } from "../types.js";
import {
  collectFixRows,
  ulSheetsWithInItog,
  validateTdPrep,
} from "./collectTdRows.js";
import { buildPoruchenieBuffer, poruchenieFileName } from "./buildPoruchenie.js";
import { buildProformaBuffer } from "./buildProforma.js";
import { buildSpecificationBuffer } from "./buildSpecification.js";
import { buildWriteoffBuffer } from "./buildWriteoff.js";
import { defaultProformaDraft, defaultSpecificationDraft } from "./defaults.js";
import {
  buildWriteoffInputs,
  poruchenieInputs,
} from "./preview.js";
import type { TdDocType, TdDraft, TdExportContext, TdExportFile } from "./types.js";

export type {
  TdDraft,
  TdDocType,
  TdExportFile,
  TdExportContext,
  SpecificationDraft,
  ProformaDraft,
} from "./types.js";

export {
  collectFixRows,
  validateTdPrep,
} from "./collectTdRows.js";
export { isHolzCarrier } from "./isHolzCarrier.js";
export {
  defaultSpecificationDraft,
  defaultProformaDraft,
} from "./defaults.js";
export {
  buildWriteoffInputs,
  poruchenieInputs,
  specificationPreviewRows,
  proformaPreviewRows,
} from "./preview.js";

function firstHeaderTd(workbook: HaulzWorkbook): string {
  for (const { sheet } of ulSheetsWithInItog(workbook)) {
    const td = String(sheet.tdNumber ?? "").trim();
    if (td) return td;
  }
  return "";
}

export async function exportTdDocuments(
  ctx: TdExportContext,
  docType: TdDocType,
): Promise<TdExportFile[]> {
  const errors = validateTdPrep(ctx.workbook);
  if (errors.length) throw new Error(errors.join("\n"));

  const fixRows = collectFixRows(ctx.workbook);
  const specDraft = ctx.draft?.specification ?? defaultSpecificationDraft(firstHeaderTd(ctx.workbook));
  const proformaDraft = ctx.draft?.proforma ?? defaultProformaDraft();
  const files: TdExportFile[] = [];
  const want = (t: TdDocType) => docType === "all" || docType === t;

  if (want("specification")) {
    files.push({
      name: "Спецификация.xlsx",
      buffer: await buildSpecificationBuffer(fixRows, specDraft),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  if (want("proforma")) {
    files.push({
      name: "Проформа.xlsx",
      buffer: await buildProformaBuffer(fixRows, proformaDraft),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  if (want("writeoff")) {
    const sheets = buildWriteoffInputs(ctx);
    if (sheets.length) {
      files.push({
        name: "Листы списания.xlsx",
        buffer: await buildWriteoffBuffer(sheets),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
  }
  if (want("poruchenie")) {
    for (const input of poruchenieInputs(ctx)) {
      files.push({
        name: poruchenieFileName(input.ulNumber),
        buffer: await buildPoruchenieBuffer(input),
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }
  }
  return files;
}

export async function exportTdZip(ctx: TdExportContext): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const files = await exportTdDocuments(ctx, "all");
  for (const f of files) zip.file(f.name, f.buffer);
  return zip.generateAsync({ type: "nodebuffer" });
}
