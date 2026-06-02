import type { HaulzCarrier } from "../carriers.js";
import type { HaulzWorkbook } from "../types.js";
import {
  collectFixRows,
  collectWriteoffRowsForUl,
  findUlSheet,
  lookupItogProductName,
  buildItogProductNameLookup,
  ulSheetsWithInItog,
  type FixTdRow,
  type UlWriteoffRow,
} from "./collectTdRows.js";
import { isHolzCarrier } from "./isHolzCarrier.js";
import { formatWriteoffTitle, formatWriteoffTdLineFromSpecification } from "./formatWriteoffHeader.js";
import { ulSheetWriteoffMeta } from "./parseUlTdNumber.js";
import { normalizeSpecificationDraft } from "./draftDateFields.js";
import {
  renumberPoruchenieRows,
  resolvePoruchenieAssignmentNumber,
  resolvePoruchenieBaseAssignmentNumber,
  resolvePoruchenieSharedHeaderDraft,
  resolvePoruchenieUlDraft,
} from "./formatPoruchenieDraft.js";
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
  }));
}

export function porucheniePreviewRows(rows: UlWriteoffRow[]) {
  return rows.map((r) => ({
    num: r.num,
    rowNum: r.rowNum,
    id: r.id,
    parcel: r.parcel,
    weight: r.weight,
    name: r.name,
    qty: r.qty,
    cost: r.cost,
  }));
}

export function buildWriteoffInputs(ctx: TdExportContext): WriteoffSheetInput[] {
  const lookup = buildItogProductNameLookup(ctx.workbook);
  const refreshWriteoffNames = (rows: UlWriteoffRow[]): UlWriteoffRow[] =>
    rows.map((r) => {
      const fromItog =
        lookupItogProductName(lookup, r.ulNumber, r.rowNum, r.parcel) ||
        lookup.get(`parcel:${r.parcel}`);
      return fromItog ? { ...r, name: fromItog } : r;
    });

  const mergedDraft = { ...ctx.workbook.tdPrepared?.draft, ...ctx.draft };
  const specDraft = normalizeSpecificationDraft({ ...(mergedDraft.specification ?? {}) });

  const withHeader = (
    w: { ulNumber: string; ulDate?: string; tdNumber: string; sheetNumber?: number; rows: UlWriteoffRow[] },
  ): WriteoffSheetInput => {
    const rows = refreshWriteoffNames(w.rows);
    return {
      ulNumber: w.ulNumber,
      tdNumber: w.tdNumber,
      sheetNumber: w.sheetNumber,
      rows,
      titleOverride:
        mergedDraft.writeoff?.[w.ulNumber]?.title ??
        formatWriteoffTitle({
          sheetNumber: w.sheetNumber,
          ulNumber: w.ulNumber,
          ulDate: w.ulDate,
          tdNumber: w.tdNumber,
          rows,
          specification: specDraft,
        }),
      tdLineOverride:
        mergedDraft.writeoff?.[w.ulNumber]?.tdLine ??
        formatWriteoffTdLineFromSpecification(specDraft, w.tdNumber),
    };
  };

  const activeUlSheets = ulSheetsWithInItog(ctx.workbook);
  const preparedByUl = new Map(
    (ctx.workbook.tdPrepared?.writeoffs ?? []).map((w) => [w.ulNumber, w]),
  );

  return activeUlSheets.map(({ sheet, ulNumber }, idx) => {
    const prev = preparedByUl.get(ulNumber);
    const meta = ulSheetWriteoffMeta(sheet);
    const liveRows = collectWriteoffRowsForUl(ctx.workbook, sheet, meta.ulNumber);
    const rows = liveRows.length > 0 ? liveRows : (prev?.rows ?? []);
    return withHeader({
      ulNumber: meta.ulNumber,
      ulDate: meta.ulDate,
      tdNumber: String(sheet.tdNumber ?? prev?.tdNumber ?? "").trim(),
      sheetNumber: idx + 1,
      rows,
    });
  });
}

export function poruchenieInputs(ctx: TdExportContext): PoruchenieInput[] {
  const writeoffs = buildWriteoffInputs(ctx);
  const mergedDraft = { ...ctx.workbook.tdPrepared?.draft, ...ctx.draft };
  const specDraft = normalizeSpecificationDraft({ ...(mergedDraft.specification ?? {}) });
  const poruchenieDraft = mergedDraft.poruchenie ?? {};

  const eligible: Array<{ wo: WriteoffSheetInput; carrier: HaulzCarrier }> = [];
  for (const wo of writeoffs) {
    const sheet = findUlSheet(ctx.workbook, wo.ulNumber);
    const carrier = sheet?.carrierId ? ctx.carriersById.get(sheet.carrierId) : undefined;
    if (!carrier || isHolzCarrier(carrier)) continue;
    if (wo.rows.length === 0) continue;
    eligible.push({ wo, carrier });
  }

  if (eligible.length === 0) return [];

  const firstUlNumber = eligible[0]!.wo.ulNumber;
  const baseNumber = resolvePoruchenieBaseAssignmentNumber(
    poruchenieDraft,
    firstUlNumber,
    eligible[0]!.wo.sheetNumber ?? 1,
  );
  const sharedHeader = resolvePoruchenieSharedHeaderDraft(poruchenieDraft, firstUlNumber);

  return eligible.map(({ wo, carrier }, index) => {
    const header = resolvePoruchenieUlDraft(specDraft, wo.sheetNumber ?? index + 1, {
      ...sharedHeader,
      number: resolvePoruchenieAssignmentNumber(baseNumber, index),
    });
    return {
      ulNumber: wo.ulNumber,
      assignmentNumber: header.number,
      writeoffNumber: wo.sheetNumber ?? index + 1,
      tdNumber: wo.tdNumber,
      carrier,
      rows: renumberPoruchenieRows(wo.rows),
      writeoffSheetCount: 1,
      date: header.date,
      contractNumber: header.contractNumber,
      contractDate: header.contractDate,
    };
  });
}

export { collectFixRows, ulSheetsWithInItog, type FixTdRow, type UlWriteoffRow };
export { validateTdPrep } from "./collectTdRows.js";
