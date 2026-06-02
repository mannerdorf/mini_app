import type { ProformaDraft } from "./types.js";
import {
  setCellValue,
  tryMergeCells,
} from "./excelUtils.js";
import { applySpecCellStyle } from "./specSheetStyles.js";
import { formatSpecificationPartyRows } from "./specPartyDefaults.js";
import { PROFORMA_TEMPLATE } from "./templateMaps.js";

export const PROFORMA_TABLE_COLS = 7;
const HEADER_LAST_ROW = 13;
/** Красный блок шапки — с середины листа (A–C слева, D–G справа). */
const PROFORMA_HEADER_RIGHT_START = 4;
const PROFORMA_HEADER_LEFT_END = PROFORMA_HEADER_RIGHT_START - 1;
const PROFORMA_TITLE_ROW = PROFORMA_TEMPLATE.header.row5Title.row;
const PROFORMA_TD_ROW = PROFORMA_TEMPLATE.header.row5Td.row;

/** Ширины колонок таблицы (символы Excel): наименование шире, остальные — минимум для печати. */
export const PROFORMA_COLUMN_WIDTHS: Record<number, number> = {
  1: 4, // № п/п
  2: 11, // ID посылки (11 цифр)
  3: 11, // Номер посылки
  4: 58, // Наименование
  5: 5, // Кол-во
  6: 6, // Вес
  7: 9, // Стоимость
};

export function applyProformaColumnWidths(sheet: import("exceljs").Worksheet) {
  for (const [col, width] of Object.entries(PROFORMA_COLUMN_WIDTHS)) {
    sheet.getColumn(Number(col)).width = width;
  }
}

const RED_HEADER_ROWS = [1, 2, 3, 4] as const;
const BODY_HEADER_ROWS = [9, 10, 11, 12] as const;
/** Две пустые строки между красной шапкой и «Счет-проформа». */
const TITLE_GAP_ROWS = [6, 7] as const;
const SPACER_ROWS = [...TITLE_GAP_ROWS, 13] as const;

function applyPartyHeaderRows(sheet: import("exceljs").Worksheet) {
  const rows = formatSpecificationPartyRows();
  const values = [rows.shipper, rows.loading, rows.consignee, rows.unloading];
  for (let i = 0; i < BODY_HEADER_ROWS.length; i++) {
    setCellValue(sheet, BODY_HEADER_ROWS[i]!, 1, values[i] ?? "");
  }
}

function applyHeaderValues(sheet: import("exceljs").Worksheet, draft: ProformaDraft, headerTd = "") {
  const h = PROFORMA_TEMPLATE.header;
  for (const row of RED_HEADER_ROWS) {
    for (let c = PROFORMA_HEADER_RIGHT_START; c <= PROFORMA_TABLE_COLS; c++) {
      sheet.getCell(row, c).value = null;
    }
  }
  for (let c = 1; c <= PROFORMA_TABLE_COLS; c++) {
    sheet.getCell(PROFORMA_TD_ROW, c).value = null;
    sheet.getCell(PROFORMA_TITLE_ROW, c).value = null;
  }
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Td.row, h.row5Td.col, headerTd);
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
}

function clearMergedRowSlaves(sheet: import("exceljs").Worksheet, row: number, masterCol: number, colEnd: number) {
  for (let c = masterCol + 1; c <= colEnd; c++) {
    sheet.getCell(row, c).value = null;
  }
}

function mergeHeaderBlocks(sheet: import("exceljs").Worksheet) {
  tryMergeCells(sheet, 1, 1, 4, PROFORMA_HEADER_LEFT_END);
  for (const row of RED_HEADER_ROWS) {
    tryMergeCells(sheet, row, PROFORMA_HEADER_RIGHT_START, row, PROFORMA_TABLE_COLS);
    clearMergedRowSlaves(sheet, row, PROFORMA_HEADER_RIGHT_START, PROFORMA_TABLE_COLS);
  }
  tryMergeCells(sheet, PROFORMA_TD_ROW, 1, PROFORMA_TD_ROW, PROFORMA_HEADER_LEFT_END);
  clearMergedRowSlaves(sheet, PROFORMA_TD_ROW, 1, PROFORMA_HEADER_LEFT_END);
  tryMergeCells(sheet, PROFORMA_TD_ROW, PROFORMA_HEADER_RIGHT_START, PROFORMA_TD_ROW, PROFORMA_TABLE_COLS);
  clearMergedRowSlaves(sheet, PROFORMA_TD_ROW, PROFORMA_HEADER_RIGHT_START, PROFORMA_TABLE_COLS);
  tryMergeCells(sheet, PROFORMA_TITLE_ROW, 1, PROFORMA_TITLE_ROW, PROFORMA_HEADER_LEFT_END);
  clearMergedRowSlaves(sheet, PROFORMA_TITLE_ROW, 1, PROFORMA_HEADER_LEFT_END);
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
    applySpecCellStyle(sheet.getCell(row, PROFORMA_HEADER_RIGHT_START), { red: true, borders: false });
  }
  applySpecCellStyle(sheet.getCell(PROFORMA_TD_ROW, PROFORMA_HEADER_RIGHT_START), { red: true, borders: false });
  applySpecCellStyle(sheet.getCell(PROFORMA_TITLE_ROW, 1), { red: true, borders: false });
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
  mergeHeaderBlocks(sheet);
  applyHeaderValues(sheet, draft, headerTd);
  applyPartyHeaderRows(sheet);
  styleHeaderCells(sheet);

  for (const row of SPACER_ROWS) {
    sheet.getRow(row).height = 6;
  }
}
