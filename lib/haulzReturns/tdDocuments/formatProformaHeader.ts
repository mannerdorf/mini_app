import type { ProformaDraft } from "./types.js";
import {
  consolidateRowText,
  setCellValue,
  tryMergeCells,
} from "./excelUtils.js";
import { applySpecCellStyle } from "./specSheetStyles.js";
import { PROFORMA_TEMPLATE } from "./templateMaps.js";

export const PROFORMA_TABLE_COLS = 7;
const HEADER_LAST_ROW = 9;

const RED_HEADER_ROWS = [1, 2, 3, 4] as const;
const BODY_HEADER_ROWS = [7, 8] as const;
const SPACER_ROWS = [6, 9] as const;

function applyHeaderValues(sheet: import("exceljs").Worksheet, draft: ProformaDraft, headerTd = "") {
  const h = PROFORMA_TEMPLATE.header;
  for (const row of RED_HEADER_ROWS) {
    for (let c = 5; c <= PROFORMA_TABLE_COLS; c++) {
      sheet.getCell(row, c).value = null;
    }
  }
  for (let c = 1; c <= PROFORMA_TABLE_COLS; c++) {
    sheet.getCell(5, c).value = null;
  }
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
  setCellValue(sheet, h.row5Td.row, h.row5Td.col, headerTd);
}

function clearMergedRowSlaves(sheet: import("exceljs").Worksheet, row: number, masterCol: number, colEnd: number) {
  for (let c = masterCol + 1; c <= colEnd; c++) {
    sheet.getCell(row, c).value = null;
  }
}

function mergeHeaderBlocks(sheet: import("exceljs").Worksheet) {
  tryMergeCells(sheet, 1, 1, 4, 4);
  for (const row of RED_HEADER_ROWS) {
    tryMergeCells(sheet, row, 5, row, PROFORMA_TABLE_COLS);
    clearMergedRowSlaves(sheet, row, 5, PROFORMA_TABLE_COLS);
  }
  tryMergeCells(sheet, 5, 1, 5, 4);
  clearMergedRowSlaves(sheet, 5, 1, 4);
  tryMergeCells(sheet, 5, 5, 5, PROFORMA_TABLE_COLS);
  clearMergedRowSlaves(sheet, 5, 5, PROFORMA_TABLE_COLS);
  for (const row of SPACER_ROWS) {
    tryMergeCells(sheet, row, 1, row, PROFORMA_TABLE_COLS);
  }
  for (const row of BODY_HEADER_ROWS) {
    tryMergeCells(sheet, row, 1, row, PROFORMA_TABLE_COLS);
    clearMergedRowSlaves(sheet, row, 1, PROFORMA_TABLE_COLS);
  }
}

function styleHeaderCells(sheet: import("exceljs").Worksheet) {
  for (const row of RED_HEADER_ROWS) {
    applySpecCellStyle(sheet.getCell(row, 5), { red: true, borders: false });
  }
  applySpecCellStyle(sheet.getCell(5, 1), { red: true, borders: false });
  applySpecCellStyle(sheet.getCell(5, 5), { red: true, borders: false });
  for (const row of BODY_HEADER_ROWS) {
    applySpecCellStyle(sheet.getCell(row, 1), { borders: false });
  }
  for (let r = 1; r <= HEADER_LAST_ROW; r++) {
    for (let c = 1; c <= PROFORMA_TABLE_COLS; c++) {
      sheet.getCell(r, c).border = {};
    }
  }
}

/** Объединение ячеек и единая типографика шапки проформы (7 колонок, без границ). */
export function formatProformaHeader(
  sheet: import("exceljs").Worksheet,
  draft: ProformaDraft,
  headerTd = "",
) {
  for (const row of BODY_HEADER_ROWS) {
    consolidateRowText(sheet, row, PROFORMA_TABLE_COLS);
  }

  mergeHeaderBlocks(sheet);
  applyHeaderValues(sheet, draft, headerTd);
  styleHeaderCells(sheet);

  for (const row of SPACER_ROWS) {
    sheet.getRow(row).height = 6;
  }
}
