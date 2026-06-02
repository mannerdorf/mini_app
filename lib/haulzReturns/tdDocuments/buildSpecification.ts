import type { FixTdRow } from "./collectTdRows.js";
import { SPEC_TEMPLATE } from "./templateMaps.js";
import type { SpecificationDraft } from "./types.js";
import {
  clearRowsFrom,
  loadTemplateWorkbook,
  setCellValue,
  workbookToBuffer,
} from "./excelUtils.js";
import { normalizeSpecificationDraft } from "./draftDateFields.js";

export type { SpecificationDraft } from "./types.js";
export { defaultSpecificationDraft } from "./defaults.js";

function applyHeader(sheet: import("exceljs").Worksheet, draft: SpecificationDraft) {
  const h = SPEC_TEMPLATE.header;
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
  setCellValue(sheet, h.row5Td.row, h.row5Td.col, draft.headerTd ?? "");
}

function fillDataRows(sheet: import("exceljs").Worksheet, rows: FixTdRow[]) {
  const { dataStartRow, dataCols } = SPEC_TEMPLATE;
  clearRowsFrom(sheet, dataStartRow, 8);
  rows.forEach((row, i) => {
    const r = dataStartRow + i;
    setCellValue(sheet, r, dataCols.num, row.num);
    setCellValue(sheet, r, dataCols.id, row.id);
    setCellValue(sheet, r, dataCols.parcel, row.parcel);
    setCellValue(sheet, r, dataCols.name, row.name);
    setCellValue(sheet, r, dataCols.qty, row.qty);
    setCellValue(sheet, r, dataCols.weight, row.weight);
    setCellValue(sheet, r, dataCols.cost, row.cost);
    setCellValue(sheet, r, dataCols.tdNumber, row.tdNumber);
  });
}

export async function buildSpecificationBuffer(
  rows: FixTdRow[],
  draft: SpecificationDraft,
): Promise<Buffer> {
  const normalized = normalizeSpecificationDraft(draft);
  const wb = await loadTemplateWorkbook("specification.xlsx");
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Шаблон спецификации пуст");
  applyHeader(sheet, normalized);
  fillDataRows(sheet, rows);
  return workbookToBuffer(wb);
}
