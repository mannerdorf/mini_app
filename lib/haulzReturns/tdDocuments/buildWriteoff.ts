import { WRITEOFF_TEMPLATE } from "./templateMaps.js";
import type { WriteoffSheetInput } from "./types.js";
import {
  loadTemplateWorkbook,
  setCellValue,
  workbookToBuffer,
} from "./excelUtils.js";

export type { WriteoffSheetInput } from "./types.js";

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
  return ws;
}

function fillWriteoffSheet(
  sheet: import("exceljs").Worksheet,
  input: WriteoffSheetInput,
  date = formatRuDate(),
) {
  const sheetNo = input.sheetNumber ?? 1;
  const title =
    input.titleOverride ??
    `Дополнительный лист списания №${sheetNo} от ${date} к упаковочному листу ${input.ulNumber}`;
  const tdLine = input.tdLineOverride ?? `Вывезено по ТД ${input.tdNumber}                /`;

  setCellValue(sheet, WRITEOFF_TEMPLATE.titleRow, 1, title);
  setCellValue(sheet, WRITEOFF_TEMPLATE.tdRow, 1, tdLine);

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

export { templatePath };
