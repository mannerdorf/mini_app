import { WRITEOFF_TEMPLATE } from "./templateMaps.js";
import type { WriteoffSheetInput } from "./types.js";
import { formatRuDate } from "./defaults.js";
import {
  loadTemplateWorkbook,
  setCellValue,
  tryMergeCells,
  workbookToBuffer,
} from "./excelUtils.js";

export type { WriteoffSheetInput } from "./types.js";

const WRITEOFF_HEADER_COLS = 11;

function applyWriteoffHeaderRow(sheet: import("exceljs").Worksheet, row: number, text: string) {
  for (let c = 1; c <= WRITEOFF_HEADER_COLS; c++) {
    sheet.getCell(row, c).value = null;
  }
  tryMergeCells(sheet, row, 1, row, WRITEOFF_HEADER_COLS);
  setCellValue(sheet, row, 1, text);
}

function cloneWorksheet(
  wb: import("exceljs").Workbook,
  source: import("exceljs").Worksheet,
  name: string,
) {
  const ws = wb.addWorksheet(name);
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const target = ws.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const t = target.getCell(colNumber);
      t.value = cell.value;
      if (cell.style) t.style = JSON.parse(JSON.stringify(cell.style));
      if (cell.numFmt) t.numFmt = cell.numFmt;
    });
    target.height = row.height;
    target.commit();
  });
  source.columns?.forEach((col, idx) => {
    if (col?.width) ws.getColumn(idx + 1).width = col.width;
  });
  for (const ref of source.model.merges ?? []) {
    try {
      ws.mergeCells(ref);
    } catch {
      // ignore invalid merge from template
    }
  }
  return ws;
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
}

export async function buildWriteoffBuffer(sheets: WriteoffSheetInput[]): Promise<Buffer> {
  const templateWb = await loadTemplateWorkbook("writeoff.xlsx");
  const templateSheet = templateWb.worksheets[0];
  if (!templateSheet) throw new Error("Шаблон листа списания пуст");

  const ExcelJS = await import("exceljs");
  const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
  const out = new Workbook();

  for (const input of sheets) {
    const ws = cloneWorksheet(out, templateSheet, input.ulNumber);
    fillWriteoffSheet(ws, input);
  }

  return workbookToBuffer(out);
}
