import type { HaulzCarrier } from "../carriers.js";
import type { HaulzWorkbook } from "../types.js";
import {
  collectFixRows,
  validateTdPrep,
} from "./collectTdRows.js";
import { buildPoruchenieBuffer, poruchenieFileName } from "./buildPoruchenie.js";
import { buildProformaBuffer } from "./buildProforma.js";
import { buildSpecificationBuffer } from "./buildSpecification.js";
import { buildWriteoffBuffer } from "./buildWriteoff.js";
import { proformaExportFileName, specificationExportFileName, writeoffExportFileName } from "./fileNames.js";
import {
  buildWriteoffInputs,
  poruchenieInputs,
} from "./preview.js";
import { firstHeaderTd } from "./prepareTd.js";
import { resolveTdExportDraft } from "./resolveTdDraft.js";
import type { TdDocType, TdDraft, TdExportContext, TdExportFile, TdPrepared, WriteoffSheetInput } from "./types.js";

export type {
  TdDraft,
  TdDocType,
  TdExportFile,
  TdExportContext,
  TdPrepared,
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
export { buildTdPrepared, firstHeaderTd } from "./prepareTd.js";

export type TdExportOptions = Record<string, never>;

export async function exportTdDocuments(
  ctx: TdExportContext,
  docType: TdDocType,
  prepared?: TdPrepared,
  options?: TdExportOptions,
): Promise<TdExportFile[]> {
  const snapshot = prepared ?? ctx.workbook.tdPrepared;
  if (!snapshot) {
    throw new Error("Сначала нажмите «Подготовить ТД» на вкладке итог.");
  }

  const draft: TdDraft = { ...snapshot.draft, ...ctx.draft };
  const fixRows = snapshot.fixRows?.length ? snapshot.fixRows : collectFixRows(ctx.workbook);
  const { specification: specDraft, proforma: proformaDraft, headerTd } = resolveTdExportDraft(
    draft,
    ctx.workbook,
  );
  const files: TdExportFile[] = [];
  const want = (t: TdDocType) => docType === "all" || docType === t;

  if (want("specification")) {
    files.push({
      name: specificationExportFileName(specDraft.title ?? ""),
      buffer: await buildSpecificationBuffer(fixRows, specDraft),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  if (want("proforma")) {
    files.push({
      name: proformaExportFileName(proformaDraft.title ?? ""),
      buffer: await buildProformaBuffer(fixRows, proformaDraft, headerTd),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  if (want("writeoff")) {
    const exportCtx = {
      ...ctx,
      draft,
      workbook: { ...ctx.workbook, tdPrepared: snapshot },
    };
    const sheets = buildWriteoffInputs(exportCtx);
    if (sheets.length) {
      files.push({
        name: writeoffExportFileName(specDraft.title ?? ""),
        buffer: await buildWriteoffBuffer(sheets),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
  }
  if (want("poruchenie")) {
    const exportCtx = {
      ...ctx,
      draft,
      workbook: { ...ctx.workbook, tdPrepared: snapshot },
    };
    for (const input of poruchenieInputs(exportCtx)) {
      files.push({
        name: poruchenieFileName(input),
        buffer: await buildPoruchenieBuffer(input),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
  }
  return files;
}

export async function exportTdZip(ctx: TdExportContext, prepared?: TdPrepared): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const files = await exportTdDocuments(ctx, "all", prepared);
  if (files.length === 0) {
    throw new Error("Нет документов для выгрузки — сначала нажмите «Подготовить ТД»");
  }
  for (const f of files) zip.file(f.name, f.buffer);
  return zip.generateAsync({ type: "nodebuffer" });
}
