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
import { defaultProformaDraft, defaultSpecificationDraft } from "./defaults.js";
import {
  buildWriteoffInputs,
  poruchenieInputs,
} from "./preview.js";
import { firstHeaderTd } from "./prepareTd.js";
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

function writeoffSheetsFromPrepared(prepared: TdPrepared, draft?: TdDraft) {
  const mergedDraft = { ...prepared.draft, ...draft };
  return prepared.writeoffs.map((w) => ({
    ulNumber: w.ulNumber,
    tdNumber: w.tdNumber,
    sheetNumber: w.sheetNumber,
    rows: w.rows,
    titleOverride: mergedDraft.writeoff?.[w.ulNumber]?.title,
    tdLineOverride: mergedDraft.writeoff?.[w.ulNumber]?.tdLine,
  }));
}

export async function exportTdDocuments(
  ctx: TdExportContext,
  docType: TdDocType,
  prepared?: TdPrepared,
): Promise<TdExportFile[]> {
  const snapshot = prepared ?? ctx.workbook.tdPrepared;
  if (!snapshot) {
    throw new Error("Сначала нажмите «Подготовить ТД» на вкладке итог.");
  }

  const draft: TdDraft = { ...snapshot.draft, ...ctx.draft };
  const fixRows = snapshot.fixRows;
  const specDraft = draft.specification ?? defaultSpecificationDraft(firstHeaderTd(ctx.workbook));
  const proformaDraft = draft.proforma ?? defaultProformaDraft();
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
    const sheets = writeoffSheetsFromPrepared(snapshot, ctx.draft);
    if (sheets.length) {
      files.push({
        name: "Листы списания.xlsx",
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
        name: poruchenieFileName(input.ulNumber),
        buffer: await buildPoruchenieBuffer(input),
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }
  }
  return files;
}

export async function exportTdZip(ctx: TdExportContext, prepared?: TdPrepared): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const files = await exportTdDocuments(ctx, "all", prepared);
  for (const f of files) zip.file(f.name, f.buffer);
  return zip.generateAsync({ type: "nodebuffer" });
}
