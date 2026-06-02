import type { FixTdRow } from "./collectTdRows.js";
import { PROFORMA_TEMPLATE } from "./templateMaps.js";
import type { ProformaDraft } from "./types.js";
import {
  clearRowsFrom,
  loadTemplateWorkbook,
  setCellValue,
  workbookToBuffer,
} from "./excelUtils.js";

export type { ProformaDraft } from "./types.js";
export { defaultProformaDraft } from "./defaults.js";

function applyHeader(sheet: import("exceljs").Worksheet, draft: ProformaDraft) {
  const h = PROFORMA_TEMPLATE.header;
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
}

function fillDataRows(sheet: import("exceljs").Worksheet, rows: FixTdRow[]) {
  const { dataStartRow, dataCols } = PROFORMA_TEMPLATE;
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
  });
}

export async function buildProformaBuffer(rows: FixTdRow[], draft: ProformaDraft): Promise<Buffer> {
  const wb = await loadTemplateWorkbook("proforma.xlsx");
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Шаблон проформы пуст");
  applyHeader(sheet, draft);
  fillDataRows(sheet, rows);
  return workbookToBuffer(wb);
}
