import { WRITEOFF_TEMPLATE } from "./templateMaps.js";
import type { WriteoffSheetInput } from "./types.js";
import { formatRuDate } from "./defaults.js";
import { applySpecCellStyle, applySpecTableRangeBorders, SPEC_FONT, SPEC_FONT_SIZE } from "./specSheetStyles.js";
import {
  loadTemplateWorkbook,
  setCellValue,
  trimWorksheetRowsAfter,
  tryMergeCells,
  workbookToBuffer,
} from "./excelUtils.js";

export type { WriteoffSheetInput } from "./types.js";

const WRITEOFF_HEADER_COLS = 11;
const WRITEOFF_TEMPLATE_HEADER_ROWS = WRITEOFF_TEMPLATE.dataStartRow - 1;

let cachedWriteoffTemplateSheet: import("exceljs").Worksheet | null = null;

async function getWriteoffTemplateSheet(): Promise<import("exceljs").Worksheet> {
  if (!cachedWriteoffTemplateSheet) {
    const templateWb = await loadTemplateWorkbook("writeoff.xlsx");
    cachedWriteoffTemplateSheet = templateWb.worksheets[0] ?? null;
  }
  if (!cachedWriteoffTemplateSheet) throw new Error("Шаблон листа списания пуст");
  return cachedWriteoffTemplateSheet;
}

function mergeTopRow(ref: string): number {
  const m = /^([A-Z]+)(\d+)/i.exec(ref);
  return m?.[2] ? Number(m[2]) : 999;
}

function copyCellStyle(from: import("exceljs").Cell, to: import("exceljs").Cell) {
  if (from.style) to.style = from.style;
  if (from.numFmt) to.numFmt = from.numFmt;
}

/** Клонирует только шапку шаблона (без строк-примеров) — быстрее на сессиях с десятками УЛ. */
function cloneWorksheetHeader(
  wb: import("exceljs").Workbook,
  source: import("exceljs").Worksheet,
  name: string,
) {
  const ws = wb.addWorksheet(name);
  for (let rowNumber = 1; rowNumber <= WRITEOFF_TEMPLATE_HEADER_ROWS; rowNumber++) {
    const row = source.getRow(rowNumber);
    const target = ws.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const t = target.getCell(colNumber);
      t.value = cell.value;
      copyCellStyle(cell, t);
    });
    target.height = row.height;
    target.commit();
  }
  source.columns?.forEach((col, idx) => {
    if (col?.width) ws.getColumn(idx + 1).width = col.width;
  });
  for (const ref of source.model.merges ?? []) {
    if (mergeTopRow(ref) > WRITEOFF_TEMPLATE_HEADER_ROWS) continue;
    try {
      ws.mergeCells(ref);
    } catch {
      // ignore invalid merge from template
    }
  }
  return ws;
}

function styleTableRow(sheet: import("exceljs").Worksheet, row: number, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    applySpecCellStyle(sheet.getCell(row, c));
  }
}

function styleWriteoffDataBlock(
  sheet: import("exceljs").Worksheet,
  rowStart: number,
  rowEnd: number,
  colCount: number,
) {
  if (rowEnd < rowStart) return;
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = 1; c <= colCount; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: SPEC_FONT, size: SPEC_FONT_SIZE };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    }
  }
  applySpecTableRangeBorders(sheet, rowStart, rowEnd, 1, colCount);
}

function applyWriteoffHeaderRow(sheet: import("exceljs").Worksheet, row: number, text: string) {
  for (let c = 1; c <= WRITEOFF_HEADER_COLS; c++) {
    sheet.getCell(row, c).value = null;
  }
  tryMergeCells(sheet, row, 1, row, WRITEOFF_HEADER_COLS);
  setCellValue(sheet, row, 1, text);
}

function fillWriteoffSheet(
  sheet: import("exceljs").Worksheet,
  input: WriteoffSheetInput,
  date = formatRuDate(),
) {
  const sheetNo = input.sheetNumber ?? 1;
  const title = input.titleOverride ?? `Дополнительный лист списания №${sheetNo} от ${date} к упаковочному листу № ${input.ulNumber}`;
  const tdLine = input.tdLineOverride ?? `Вывезено по ТД ${input.tdNumber}/ /`;

  applyWriteoffHeaderRow(sheet, WRITEOFF_TEMPLATE.titleRow, title);
  applyWriteoffHeaderRow(sheet, WRITEOFF_TEMPLATE.tdRow, tdLine);
  styleTableRow(sheet, WRITEOFF_TEMPLATE.tableHeaderRow, WRITEOFF_HEADER_COLS);

  const { dataStartRow, dataCols } = WRITEOFF_TEMPLATE;

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const r = dataStartRow + i;
    setCellValue(sheet, r, dataCols.num, row.num);
    setCellValue(sheet, r, dataCols.ulLine, row.rowNum);
    setCellValue(sheet, r, dataCols.id, row.id);
    setCellValue(sheet, r, dataCols.parcel, row.parcel);
    setCellValue(sheet, r, dataCols.airport, row.airport);
    setCellValue(sheet, r, dataCols.weight, row.weight);
    setCellValue(sheet, r, dataCols.volume, row.volume);
    setCellValue(sheet, r, dataCols.category, row.category);
    setCellValue(sheet, r, dataCols.name, row.name);
    setCellValue(sheet, r, dataCols.qty, row.qty);
    setCellValue(sheet, r, dataCols.cost, row.cost);
  }

  const lastRow = input.rows.length > 0 ? dataStartRow + input.rows.length - 1 : WRITEOFF_TEMPLATE.tableHeaderRow;
  if (input.rows.length > 0) {
    styleWriteoffDataBlock(sheet, dataStartRow, lastRow, WRITEOFF_HEADER_COLS);
  }
  trimWorksheetRowsAfter(sheet, lastRow);
}

export async function buildWriteoffBuffer(sheets: WriteoffSheetInput[]): Promise<Buffer> {
  const templateSheet = await getWriteoffTemplateSheet();

  const ExcelJS = await import("exceljs");
  const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
  const out = new Workbook();

  for (const input of sheets) {
    const ws = cloneWorksheetHeader(out, templateSheet, input.ulNumber);
    fillWriteoffSheet(ws, input);
  }

  return workbookToBuffer(out);
}
