import type { FixTdRow } from "./collectTdRows.js";
import { computeProformaTotals, normalizeProformaDraft } from "./draftDateFields.js";
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

type CellStyle = import("exceljs").Style | undefined;

function cloneStyle(style: CellStyle): CellStyle {
  if (!style) return undefined;
  return JSON.parse(JSON.stringify(style)) as CellStyle;
}

function findTemplateSummaryRow(sheet: import("exceljs").Worksheet): number | null {
  for (let r = sheet.rowCount; r >= PROFORMA_TEMPLATE.dataStartRow; r--) {
    const v = String(sheet.getCell(r, 4).value ?? "");
    if (v.includes("Итого")) return r;
  }
  return null;
}

function captureSummaryStyles(sheet: import("exceljs").Worksheet, row: number): Record<number, CellStyle> {
  const out: Record<number, CellStyle> = {};
  for (let c = 4; c <= 7; c++) {
    out[c] = cloneStyle(sheet.getCell(row, c).style);
  }
  return out;
}

function applyHeader(sheet: import("exceljs").Worksheet, draft: ProformaDraft, headerTd = "") {
  const h = PROFORMA_TEMPLATE.header;
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
  if (headerTd) {
    for (let c = 5; c <= 8; c++) {
      setCellValue(sheet, h.row5Td.row, c, headerTd);
    }
  }
}

function fillDataRows(sheet: import("exceljs").Worksheet, rows: FixTdRow[]) {
  const { dataStartRow, dataCols } = PROFORMA_TEMPLATE;
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

function fillSummaryRow(
  sheet: import("exceljs").Worksheet,
  row: number,
  totals: ReturnType<typeof computeProformaTotals>,
  styles: Record<number, CellStyle>,
) {
  setCellValue(sheet, row, 4, `Итого: грузовых мест ${totals.places}`);
  setCellValue(sheet, row, 5, totals.qty);
  setCellValue(sheet, row, 6, totals.weight);
  setCellValue(sheet, row, 7, totals.cost);
  for (const [col, style] of Object.entries(styles)) {
    if (style) sheet.getCell(row, Number(col)).style = cloneStyle(style);
  }
  const summaryCell = sheet.getCell(row, 4);
  summaryCell.font = { ...(summaryCell.font ?? {}), bold: true };
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
  const summaryStyles = templateSummaryRow ? captureSummaryStyles(sheet, templateSummaryRow) : {};

  const { dataStartRow } = PROFORMA_TEMPLATE;
  clearRowsFrom(sheet, dataStartRow, 8);

  applyHeader(sheet, normalized, headerTd);
  fillDataRows(sheet, rows);

  const totals = computeProformaTotals(rows);
  const summaryRow = dataStartRow + rows.length;
  fillSummaryRow(sheet, summaryRow, totals, summaryStyles);

  return workbookToBuffer(wb);
}
