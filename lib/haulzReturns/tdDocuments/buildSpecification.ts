import type { FixTdRow } from "./collectTdRows.js";
import { computeProformaTotals } from "./draftDateFields.js";
import { formatSpecificationHeader } from "./formatSpecificationHeader.js";
import { applySpecCellStyle, applySpecTableRangeBorders } from "./specSheetStyles.js";
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

const TABLE_COLS = 8;

function trimExtraColumns(sheet: import("exceljs").Worksheet) {
  const extra = sheet.columnCount - TABLE_COLS;
  if (extra > 0) sheet.spliceColumns(9, extra);
}

function styleTableHeaderRow(sheet: import("exceljs").Worksheet, row: number) {
  for (let c = 1; c <= TABLE_COLS; c++) {
    applySpecCellStyle(sheet.getCell(row, c));
  }
}

function fillDataRows(
  sheet: import("exceljs").Worksheet,
  rows: FixTdRow[],
  dataStartRow: number,
): number {
  clearRowsFrom(sheet, dataStartRow, TABLE_COLS);

  rows.forEach((row, i) => {
    const r = dataStartRow + i;
    for (let c = 1; c <= TABLE_COLS; c++) {
      applySpecCellStyle(sheet.getCell(r, c));
    }
    const { dataCols } = SPEC_TEMPLATE;
    setCellValue(sheet, r, dataCols.num, row.num);
    setCellValue(sheet, r, dataCols.id, row.id);
    setCellValue(sheet, r, dataCols.parcel, row.parcel);
    setCellValue(sheet, r, dataCols.name, row.name);
    setCellValue(sheet, r, dataCols.qty, row.qty);
    setCellValue(sheet, r, dataCols.weight, row.weight);
    setCellValue(sheet, r, dataCols.cost, row.cost);
    setCellValue(sheet, r, dataCols.tdNumber, row.tdNumber);
  });

  return dataStartRow + rows.length;
}

function fillSummaryRow(
  sheet: import("exceljs").Worksheet,
  row: number,
  rows: FixTdRow[],
) {
  const totals = computeProformaTotals(rows);
  for (let c = 1; c <= TABLE_COLS; c++) {
    applySpecCellStyle(sheet.getCell(row, c));
  }
  setCellValue(sheet, row, 4, `Итого: грузовых мест ${totals.places}`);
  setCellValue(sheet, row, 5, totals.qty);
  setCellValue(sheet, row, 6, totals.weight);
  setCellValue(sheet, row, 7, totals.cost);
  setCellValue(sheet, row, 8, "");
}

export async function buildSpecificationBuffer(
  rows: FixTdRow[],
  draft: SpecificationDraft,
): Promise<Buffer> {
  const normalized = normalizeSpecificationDraft(draft);
  const wb = await loadTemplateWorkbook("specification.xlsx");
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Шаблон спецификации пуст");

  const { tableHeaderRow, dataStartRow } = SPEC_TEMPLATE;

  trimExtraColumns(sheet);
  formatSpecificationHeader(sheet, normalized);
  styleTableHeaderRow(sheet, tableHeaderRow);

  const summaryRow = fillDataRows(sheet, rows, dataStartRow);
  if (rows.length > 0) {
    fillSummaryRow(sheet, summaryRow, rows);
  }

  const tableEndRow = rows.length > 0 ? summaryRow : tableHeaderRow;
  applySpecTableRangeBorders(sheet, tableHeaderRow, tableEndRow, 1, TABLE_COLS);

  return workbookToBuffer(wb);
}
