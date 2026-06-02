import type { HaulzCarrier } from "../carriers.js";
import type { HaulzWorkbook } from "../types.js";
import {
  collectFixRows,
  collectWriteoffRowsForUl,
  ulSheetsWithInItog,
  type FixTdRow,
  type UlWriteoffRow,
} from "./collectTdRows.js";
import { isHolzCarrier } from "./isHolzCarrier.js";
import type { PoruchenieInput, TdDraft, WriteoffSheetInput } from "./types.js";

export type TdExportContext = {
  workbook: HaulzWorkbook;
  carriersById: Map<string, HaulzCarrier>;
  draft?: TdDraft;
};

export function specificationPreviewRows(rows: FixTdRow[]) {
  return rows.map((r) => ({
    num: r.num,
    id: r.id,
    parcel: r.parcel,
    name: r.name,
    qty: r.qty,
    weight: r.weight,
    cost: r.cost,
    tdNumber: r.tdNumber,
    ul: r.ul,
    line: r.line,
  }));
}

export function proformaPreviewRows(rows: FixTdRow[]) {
  return rows.map((r) => ({
    num: r.num,
    id: r.id,
    parcel: r.parcel,
    name: r.name,
    qty: r.qty,
    weight: r.weight,
    cost: r.cost,
    ul: r.ul,
    line: r.line,
  }));
}

export function buildWriteoffInputs(ctx: TdExportContext): WriteoffSheetInput[] {
  const prepared = ctx.workbook.tdPrepared;
  if (prepared?.writeoffs?.length) {
    const draft = { ...prepared.draft, ...ctx.draft };
    return prepared.writeoffs.map((w) => ({
      ulNumber: w.ulNumber,
      tdNumber: w.tdNumber,
      sheetNumber: w.sheetNumber,
      rows: w.rows,
      titleOverride: draft.writeoff?.[w.ulNumber]?.title,
      tdLineOverride: draft.writeoff?.[w.ulNumber]?.tdLine,
    }));
  }
  return ulSheetsWithInItog(ctx.workbook).map(({ sheet, ulNumber }, idx) => ({
    ulNumber,
    tdNumber: String(sheet.tdNumber ?? "").trim(),
    sheetNumber: idx + 1,
    rows: collectWriteoffRowsForUl(sheet, ulNumber),
    titleOverride: ctx.draft?.writeoff?.[ulNumber]?.title,
    tdLineOverride: ctx.draft?.writeoff?.[ulNumber]?.tdLine,
  }));
}

export function poruchenieInputs(ctx: TdExportContext): PoruchenieInput[] {
  const writeoffs = buildWriteoffInputs(ctx);
  const out: PoruchenieInput[] = [];
  for (const wo of writeoffs) {
    const sheet = ctx.workbook.sheets.find((s) => s.id === `ul-${wo.ulNumber}`);
    const carrier = sheet?.carrierId ? ctx.carriersById.get(sheet.carrierId) : undefined;
    if (!carrier || isHolzCarrier(carrier)) continue;
    out.push({
      ulNumber: wo.ulNumber,
      writeoffNumber: wo.sheetNumber ?? 1,
      tdNumber: wo.tdNumber,
      carrier,
      rows: wo.rows,
    });
  }
  return out;
}

export { collectFixRows, validateTdPrep, ulSheetsWithInItog, type FixTdRow, type UlWriteoffRow };
