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
import { resolvePoruchenieUlDraft, mergePoruchenieWriteoffRows, resolveStoredPoruchenieDraft } from "./formatPoruchenieDraft.js";
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

  const prepared = ctx.workbook.tdPrepared;
  if (prepared?.writeoffs?.length) {
    return prepared.writeoffs.map((w) => {
      const sheet = findUlSheet(ctx.workbook, w.ulNumber);
      const liveRows = sheet ? collectWriteoffRowsForUl(ctx.workbook, sheet, w.ulNumber) : w.rows;
      const meta = sheet ? ulSheetWriteoffMeta(sheet) : { ulNumber: w.ulNumber, ulDate: "" };
      return withHeader({
        ulNumber: meta.ulNumber,
        ulDate: meta.ulDate,
        tdNumber: String(sheet?.tdNumber ?? w.tdNumber ?? "").trim(),
        sheetNumber: w.sheetNumber,
        rows: liveRows.length > 0 ? liveRows : w.rows,
      });
    });
  }
  return ulSheetsWithInItog(ctx.workbook).map(({ sheet }, idx) => {
    const meta = ulSheetWriteoffMeta(sheet);
    return withHeader({
      ulNumber: meta.ulNumber,
      ulDate: meta.ulDate,
      tdNumber: String(sheet.tdNumber ?? "").trim(),
      sheetNumber: idx + 1,
      rows: collectWriteoffRowsForUl(ctx.workbook, sheet, meta.ulNumber),
    });
  });
}

export function poruchenieInputs(ctx: TdExportContext): PoruchenieInput[] {
  const writeoffs = buildWriteoffInputs(ctx);
  const mergedDraft = { ...ctx.workbook.tdPrepared?.draft, ...ctx.draft };
  const specDraft = normalizeSpecificationDraft({ ...(mergedDraft.specification ?? {}) });

  const byCarrier = new Map<
    string,
    { carrier: HaulzCarrier; writeoffs: ReturnType<typeof buildWriteoffInputs> }
  >();

  for (const wo of writeoffs) {
    const sheet = findUlSheet(ctx.workbook, wo.ulNumber);
    const carrier = sheet?.carrierId ? ctx.carriersById.get(sheet.carrierId) : undefined;
    if (!carrier || isHolzCarrier(carrier)) continue;
    if (wo.rows.length === 0) continue;
    const group = byCarrier.get(carrier.id) ?? { carrier, writeoffs: [] };
    group.writeoffs.push(wo);
    byCarrier.set(carrier.id, group);
  }

  const out: PoruchenieInput[] = [];
  for (const { carrier, writeoffs: groupWriteoffs } of byCarrier.values()) {
    const rows = mergePoruchenieWriteoffRows(groupWriteoffs);
    const first = groupWriteoffs[0]!;
    const ulNumbers = groupWriteoffs.map((w) => w.ulNumber);
    const stored = resolveStoredPoruchenieDraft(mergedDraft.poruchenie, carrier.id, ulNumbers);
    const header = resolvePoruchenieUlDraft(specDraft, first.sheetNumber ?? 1, stored);
    out.push({
      ulNumber: first.ulNumber,
      assignmentNumber: header.number,
      writeoffNumber: first.sheetNumber ?? 1,
      tdNumber: first.tdNumber,
      carrier,
      rows,
      writeoffSheetCount: groupWriteoffs.length,
      date: header.date,
      contractNumber: header.contractNumber,
      contractDate: header.contractDate,
    });
  }

  return out.sort((a, b) => a.carrier.name.localeCompare(b.carrier.name, "ru"));
}

export { collectFixRows, ulSheetsWithInItog, type FixTdRow, type UlWriteoffRow };
export { validateTdPrep } from "./collectTdRows.js";
