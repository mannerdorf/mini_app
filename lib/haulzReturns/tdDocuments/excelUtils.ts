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

export function clearRowsFrom(sheet: import("exceljs").Worksheet, startRow: number, colCount: number) {
  const max = sheet.rowCount;
  for (let r = startRow; r <= max; r++) {
    for (let c = 1; c <= colCount; c++) {
      sheet.getCell(r, c).value = null;
    }
  }
}

export async function workbookToBuffer(wb: import("exceljs").Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
