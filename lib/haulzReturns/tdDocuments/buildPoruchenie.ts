import type { UlWriteoffRow } from "./collectTdRows.js";
import type { PoruchenieInput } from "./types.js";
import { formatRuDate } from "./defaults.js";
import {
  carrierQuotedName,
  formatPoruchenieCityLineExcel,
  formatPoruchenieFooterIntro,
  formatPoruchenieFooterSignatoryCarrier,
  formatPoruchenieFooterSignatoryHolz,
  formatPorucheniePreamble,
  formatPoruchenieTitleLine,
} from "./formatPoruchenieDraft.js";
import { poruchenieExportFileName } from "./fileNames.js";
import { applySpecCellStyle } from "./specSheetStyles.js";
import {
  clearRowsFrom,
  loadTemplateWorkbook,
  setCellValue,
  tryMergeCells,
  workbookToBuffer,
} from "./excelUtils.js";
import { PORUCHENIE_TEMPLATE } from "./templateMaps.js";

export type { PoruchenieInput } from "./types.js";

export function carrierShortLabel(name: string): string {
  const core = carrierQuotedName(name);
  if (core.length <= 4) return core;
  return core.slice(0, 3);
}

function formatDocWeight(v: string | number): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(".", ",");
}

function formatDocMoney(v: string | number): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(".", ",");
}

const PORUCHENIE_FOOTER_INTRO_HEIGHT = 32;
const PORUCHENIE_SIGNATURE_LINE_HEIGHT = 42;
const PORUCHENIE_SIGNATURE_GAP_HEIGHT = 48;

function clearMergedRow(sheet: import("exceljs").Worksheet, row: number) {
  const { headerCols } = PORUCHENIE_TEMPLATE;
  for (let c = 1; c <= headerCols; c++) {
    sheet.getCell(row, c).value = null;
  }
}

function fillPoruchenieFooter(
  sheet: import("exceljs").Worksheet,
  startRow: number,
  carrierName: string,
): number {
  let row = startRow;

  applyMergedRow(sheet, row, formatPoruchenieFooterIntro());
  sheet.getRow(row).height = PORUCHENIE_FOOTER_INTRO_HEIGHT;
  row++;

  applyMergedRow(sheet, row, formatPoruchenieFooterSignatoryHolz());
  sheet.getRow(row).height = PORUCHENIE_SIGNATURE_LINE_HEIGHT;
  row++;

  clearMergedRow(sheet, row);
  sheet.getRow(row).height = PORUCHENIE_SIGNATURE_GAP_HEIGHT;
  row++;

  applyMergedRow(sheet, row, formatPoruchenieFooterSignatoryCarrier(carrierName));
  sheet.getRow(row).height = PORUCHENIE_SIGNATURE_LINE_HEIGHT;
  row++;

  clearMergedRow(sheet, row);
  sheet.getRow(row).height = PORUCHENIE_SIGNATURE_GAP_HEIGHT;

  return row;
}

function applyMergedRow(sheet: import("exceljs").Worksheet, row: number, text: string) {
  const { headerCols } = PORUCHENIE_TEMPLATE;
  for (let c = 1; c <= headerCols; c++) {
    sheet.getCell(row, c).value = null;
  }
  tryMergeCells(sheet, row, 1, row, headerCols);
  setCellValue(sheet, row, 1, text);
}

function styleTableRow(sheet: import("exceljs").Worksheet, row: number, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    applySpecCellStyle(sheet.getCell(row, c));
  }
}

function fillPoruchenieSheet(sheet: import("exceljs").Worksheet, input: PoruchenieInput) {
  const date = input.date ?? formatRuDate();
  const contractNumber = input.contractNumber?.trim() || "01/26";
  const contractDate = input.contractDate?.trim() || "01.01.2026";
  const header = {
    number: input.assignmentNumber,
    date,
    contractNumber,
    contractDate,
  };

  applyMergedRow(sheet, PORUCHENIE_TEMPLATE.titleRow, formatPoruchenieTitleLine(header));
  applyMergedRow(sheet, PORUCHENIE_TEMPLATE.cityRow, formatPoruchenieCityLineExcel(date));
  applyMergedRow(
    sheet,
    PORUCHENIE_TEMPLATE.preambleRow,
    formatPorucheniePreamble({
      assignmentNumber: input.assignmentNumber,
      contractNumber,
      contractDate,
      carrierName: input.carrier.name,
    }),
  );

  const { dataStartRow, dataCols, tableHeaderRow, headerCols } = PORUCHENIE_TEMPLATE;
  styleTableRow(sheet, tableHeaderRow, headerCols);
  clearRowsFrom(sheet, dataStartRow, headerCols);
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const r = dataStartRow + i;
    styleTableRow(sheet, r, headerCols);
    setCellValue(sheet, r, dataCols.num, row.num);
    setCellValue(sheet, r, dataCols.ulLine, row.rowNum);
    setCellValue(sheet, r, dataCols.id, row.id);
    setCellValue(sheet, r, dataCols.parcel, row.parcel);
    setCellValue(sheet, r, dataCols.weight, formatDocWeight(row.weight));
    setCellValue(sheet, r, dataCols.name, row.name);
    setCellValue(sheet, r, dataCols.qty, formatDocMoney(row.qty));
    setCellValue(sheet, r, dataCols.cost, formatDocMoney(row.cost));
  }

  const footerRow = dataStartRow + input.rows.length + 1;
  fillPoruchenieFooter(sheet, footerRow, input.carrier.name);
}

export async function buildPoruchenieBuffer(input: PoruchenieInput): Promise<Buffer> {
  const wb = await loadTemplateWorkbook("poruchenie.xlsx");
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Шаблон поручения пуст");
  fillPoruchenieSheet(sheet, input);
  return workbookToBuffer(wb);
}

export function poruchenieFileName(
  input: Pick<PoruchenieInput, "assignmentNumber" | "date">,
): string {
  return poruchenieExportFileName(input.assignmentNumber, input.date ?? formatRuDate());
}
