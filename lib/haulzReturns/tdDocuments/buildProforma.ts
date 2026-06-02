import type { FixTdRow } from "./collectTdRows.js";
import { computeProformaTotals, normalizeProformaDraft } from "./draftDateFields.js";
import { formatProformaHeader, PROFORMA_TABLE_COLS, applyProformaColumnWidths } from "./formatProformaHeader.js";
import { applySpecCellStyle, applySpecTableRangeBorders } from "./specSheetStyles.js";
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

const DEFAULT_SUMMARY_NUM_FMT: Record<number, string> = {
  6: "0.00",
  7: "#,##0.00",
};

const DEFAULT_DATA_NUM_FMT: Record<number, string> = {
  6: "0.000",
  7: "#,##0.00",
};

function trimExtraColumns(sheet: import("exceljs").Worksheet) {
  const extra = sheet.columnCount - PROFORMA_TABLE_COLS;
  if (extra > 0) sheet.spliceColumns(PROFORMA_TABLE_COLS + 1, extra);
}

function findTemplateSummaryRow(sheet: import("exceljs").Worksheet): number | null {
  for (let r = sheet.rowCount; r >= PROFORMA_TEMPLATE.dataStartRow; r--) {
    const v = String(sheet.getCell(r, 4).value ?? "");
    if (v.includes("Итого")) return r;
  }
  return null;
}

function captureSummaryNumFormats(sheet: import("exceljs").Worksheet, templateRow: number | null): Record<number, string> {
  if (!templateRow) return { ...DEFAULT_SUMMARY_NUM_FMT };
  return {
    6: sheet.getCell(templateRow, 6).numFmt ?? DEFAULT_SUMMARY_NUM_FMT[6]!,
    7: sheet.getCell(templateRow, 7).numFmt ?? DEFAULT_SUMMARY_NUM_FMT[7]!,
  };
}

function captureDataNumFormats(sheet: import("exceljs").Worksheet): Record<number, string> {
  const { dataStartRow } = PROFORMA_TEMPLATE;
  return {
    6: sheet.getCell(dataStartRow, 6).numFmt ?? DEFAULT_DATA_NUM_FMT[6]!,
    7: sheet.getCell(dataStartRow, 7).numFmt ?? DEFAULT_DATA_NUM_FMT[7]!,
  };
}

function applySummaryCellStyle(cell: import("exceljs").Cell, numFmt?: string) {
  applySpecCellStyle(cell, { bold: true });
  if (numFmt) cell.numFmt = numFmt;
}

function styleTableHeaderRow(sheet: import("exceljs").Worksheet, row: number) {
  for (let c = 1; c <= PROFORMA_TABLE_COLS; c++) {
    applySpecCellStyle(sheet.getCell(row, c), { bold: true });
  }
}

function fillDataRows(
  sheet: import("exceljs").Worksheet,
  rows: FixTdRow[],
  dataStartRow: number,
  dataNumFormats: Record<number, string>,
): number {
  clearRowsFrom(sheet, dataStartRow, PROFORMA_TABLE_COLS);

  rows.forEach((row, i) => {
    const r = dataStartRow + i;
    for (let c = 1; c <= PROFORMA_TABLE_COLS; c++) {
      applySpecCellStyle(sheet.getCell(r, c));
      const fmt = dataNumFormats[c];
      if (fmt) sheet.getCell(r, c).numFmt = fmt;
    }
    const { dataCols } = PROFORMA_TEMPLATE;
    setCellValue(sheet, r, dataCols.num, row.num);
    setCellValue(sheet, r, dataCols.id, row.id);
    setCellValue(sheet, r, dataCols.parcel, row.parcel);
    setCellValue(sheet, r, dataCols.name, row.name);
    setCellValue(sheet, r, dataCols.qty, row.qty);
    setCellValue(sheet, r, dataCols.weight, row.weight);
    setCellValue(sheet, r, dataCols.cost, row.cost);
  });

  return dataStartRow + rows.length;
}

function fillSummaryRow(
  sheet: import("exceljs").Worksheet,
  row: number,
  totals: ReturnType<typeof computeProformaTotals>,
  summaryNumFormats: Record<number, string>,
) {
  for (let c = 1; c <= 3; c++) {
    applySpecCellStyle(sheet.getCell(row, c));
    sheet.getCell(row, c).value = null;
  }
  setCellValue(sheet, row, 4, `Итого: грузовых мест ${totals.places}`);
  setCellValue(sheet, row, 5, totals.qty);
  setCellValue(sheet, row, 6, totals.weight);
  setCellValue(sheet, row, 7, totals.cost);

  applySummaryCellStyle(sheet.getCell(row, 4));
  applySummaryCellStyle(sheet.getCell(row, 5));
  applySummaryCellStyle(sheet.getCell(row, 6), summaryNumFormats[6]);
  applySummaryCellStyle(sheet.getCell(row, 7), summaryNumFormats[7]);
}

export async function buildProformaBuffer(
  rows: FixTdRow[],
  draft: ProformaDraft,
  headerTd = "",
): Promise<Buffer> {
  const normalized = normalizeProformaDraft(draft);
  const wb = await loadTemplateWorkbook("proforma.xlsx");
  const sheet = wb.getWorksheet(PROFORMA_TEMPLATE.sheetName) ?? wb.worksheets[0];
  if (!sheet) throw new Error("Шаблон проформы пуст");

  const templateSummaryRow = findTemplateSummaryRow(sheet);
  const summaryNumFormats = captureSummaryNumFormats(sheet, templateSummaryRow);
  const dataNumFormats = captureDataNumFormats(sheet);

  const { tableHeaderRow, dataStartRow } = PROFORMA_TEMPLATE;

  trimExtraColumns(sheet);
  applyProformaColumnWidths(sheet);
  formatProformaHeader(sheet, normalized, headerTd);
  styleTableHeaderRow(sheet, tableHeaderRow);

  const summaryRow = fillDataRows(sheet, rows, dataStartRow, dataNumFormats);
  if (rows.length > 0) {
    const totals = computeProformaTotals(rows);
    fillSummaryRow(sheet, summaryRow, totals, summaryNumFormats);
  }

  const tableEndRow = rows.length > 0 ? summaryRow : tableHeaderRow;
  applySpecTableRangeBorders(sheet, tableHeaderRow, tableEndRow, 1, PROFORMA_TABLE_COLS);

  return workbookToBuffer(wb);
}
