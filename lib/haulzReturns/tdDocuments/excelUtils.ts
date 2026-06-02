import path from "node:path";
import { fileURLToPath } from "node:url";

export function templatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "../../../assets/haulz-td-templates");
}

export function templatePath(name: string): string {
  return path.join(templatesDir(), name);
}

export async function loadTemplateWorkbook(fileName: string) {
  const ExcelJS = await import("exceljs");
  const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
  const wb = new Workbook();
  await wb.xlsx.readFile(templatePath(fileName));
  return wb;
}

export function setCellValue(sheet: import("exceljs").Worksheet, row: number, col: number, value: unknown) {
  sheet.getCell(row, col).value = value ?? "";
}

export function clearCellBorders(sheet: import("exceljs").Worksheet, row: number, col: number) {
  sheet.getCell(row, col).border = {};
}

export function clearBordersInRange(
  sheet: import("exceljs").Worksheet,
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
) {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      clearCellBorders(sheet, r, c);
    }
  }
}

export function tryMergeCells(
  sheet: import("exceljs").Worksheet,
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
) {
  try {
    sheet.mergeCells(rowStart, colStart, rowEnd, colEnd);
  } catch {
    // already merged in template
  }
}

/** Оставляет текст только в первой ячейке строки (остальные очищает). */
export function consolidateRowText(sheet: import("exceljs").Worksheet, row: number, colCount: number) {
  let text = "";
  for (let c = 1; c <= colCount; c++) {
    const part = String(sheet.getCell(row, c).value ?? "").trim();
    if (part && !text) text = part;
  }
  for (let c = 1; c <= colCount; c++) {
    sheet.getCell(row, c).value = c === 1 ? (text || null) : null;
  }
}

export function copyMasterCellStyle(
  sheet: import("exceljs").Worksheet,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
) {
  const src = sheet.getCell(fromRow, fromCol).style;
  if (!src) return;
  const style = JSON.parse(JSON.stringify(src)) as import("exceljs").Style;
  if (style.border) style.border = {};
  sheet.getCell(toRow, toCol).style = style;
}

export function clearRowsFrom(sheet: import("exceljs").Worksheet, startRow: number, colCount: number) {
  const max = sheet.rowCount;
  for (let r = startRow; r <= max; r++) {
    for (let c = 1; c <= colCount; c++) {
      sheet.getCell(r, c).value = null;
    }
  }
}

const EXCEL_MAX_COL = 16384;

/** Удаляет столбцы и их ширины справа от таблицы (в т.ч. «фантомные» из шаблона). */
export function trimWorksheetColumns(sheet: import("exceljs").Worksheet, maxCol: number) {
  const extra = sheet.columnCount - maxCol;
  if (extra > 0) {
    sheet.spliceColumns(maxCol + 1, extra);
  }
  if (sheet.columnCount <= maxCol) {
    sheet.spliceColumns(maxCol + 1, EXCEL_MAX_COL - maxCol);
  }
}

/** Удаляет пустые строки ниже lastRow (шаблон проформы содержит тысячи пустых строк). */
export function trimWorksheetRowsAfter(sheet: import("exceljs").Worksheet, lastRow: number) {
  if (lastRow < 1) return;
  while (sheet.rowCount > lastRow) {
    const chunk = Math.min(500, sheet.rowCount - lastRow);
    sheet.spliceRows(lastRow + 1, chunk);
  }
}

export async function workbookToBuffer(wb: import("exceljs").Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
