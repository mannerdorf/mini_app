import type { HaulzCarrier } from "../carriers.js";
import type { HaulzWorkbook } from "../types.js";
import { collectFixRows, ulSheetsWithInItog, validateTdPrep } from "./collectTdRows.js";
import { defaultProformaDraft, defaultSpecificationDraft } from "./defaults.js";
import { buildWriteoffInputs } from "./preview.js";
import type { TdDraft, TdPrepared } from "./types.js";

export function firstHeaderTd(workbook: HaulzWorkbook): string {
  for (const { sheet } of ulSheetsWithInItog(workbook)) {
    const td = String(sheet.tdNumber ?? "").trim();
    if (td) return td;
  }
  return "";
}

export function buildTdPrepared(
  workbook: HaulzWorkbook,
  carriersById: Map<string, HaulzCarrier>,
): TdPrepared {
  const errors = validateTdPrep(workbook);
  if (errors.length) throw new Error(errors.join("\n"));

  const headerTd = firstHeaderTd(workbook);
  const draft: TdDraft = {
    specification: defaultSpecificationDraft(headerTd),
    proforma: defaultProformaDraft(),
  };

  const fixRows = collectFixRows(workbook);
  const writeoffs = buildWriteoffInputs({ workbook, carriersById, draft });

  return {
    preparedAt: new Date().toISOString(),
    fixRows,
    writeoffs: writeoffs.map((w) => ({
      ulNumber: w.ulNumber,
      tdNumber: w.tdNumber,
      sheetNumber: w.sheetNumber ?? 1,
      rows: w.rows,
    })),
    draft,
  };
}
