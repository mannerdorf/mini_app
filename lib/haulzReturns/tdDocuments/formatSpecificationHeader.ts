import type { SpecificationDraft } from "./types.js";
import {
  setCellValue,
  tryMergeCells,
} from "./excelUtils.js";
import { applySpecCellStyle } from "./specSheetStyles.js";
import { formatSpecificationPartyRows } from "./specPartyDefaults.js";
import { SPEC_TEMPLATE } from "./templateMaps.js";

const HEADER_LAST_ROW = 11;
const COLS = 8;

const RED_HEADER_ROWS = [1, 2, 3, 4] as const;
const BODY_HEADER_ROWS = [7, 8, 9, 10] as const;

function applyPartyHeaderRows(sheet: import("exceljs").Worksheet) {
  const rows = formatSpecificationPartyRows();
  const values = [rows.shipper, rows.loading, rows.consignee, rows.unloading];
  for (let i = 0; i < BODY_HEADER_ROWS.length; i++) {
    setCellValue(sheet, BODY_HEADER_ROWS[i]!, 1, values[i] ?? "");
  }
}

function applyHeaderValues(sheet: import("exceljs").Worksheet, draft: SpecificationDraft) {
  const h = SPEC_TEMPLATE.header;
  setCellValue(sheet, h.row1Col5.row, h.row1Col5.col, draft.productEaeu ?? "");
  setCellValue(sheet, h.row2Col5.row, h.row2Col5.col, draft.exportPermit ?? "");
  setCellValue(sheet, h.row3Col5.row, h.row3Col5.col, draft.zpu ?? "");
  setCellValue(sheet, h.row4Col5.row, h.row4Col5.col, draft.fts ?? "");
  setCellValue(sheet, h.row5Title.row, h.row5Title.col, draft.title ?? "");
  const td = draft.headerTd ?? "";
  for (let c = 5; c <= COLS; c++) {
    setCellValue(sheet, h.row5Td.row, c, td);
  }
}

function mergeHeaderBlocks(sheet: import("exceljs").Worksheet) {
  tryMergeCells(sheet, 1, 1, 4, 4);
  for (const row of RED_HEADER_ROWS) {
    tryMergeCells(sheet, row, 5, row, COLS);
  }
  tryMergeCells(sheet, 5, 1, 5, 4);
  tryMergeCells(sheet, 5, 5, 5, COLS);
  tryMergeCells(sheet, 6, 1, 6, COLS);
  for (const row of BODY_HEADER_ROWS) {
    tryMergeCells(sheet, row, 1, row, COLS);
  }
  tryMergeCells(sheet, 11, 1, 11, COLS);
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
    for (let c = 1; c <= COLS; c++) {
      sheet.getCell(r, c).border = {};
    }
  }
}

/** Объединение ячеек и единая типографика шапки спецификации. */
export function formatSpecificationHeader(sheet: import("exceljs").Worksheet, draft: SpecificationDraft) {
  mergeHeaderBlocks(sheet);
  applyHeaderValues(sheet, draft);
  applyPartyHeaderRows(sheet);
  styleHeaderCells(sheet);

  for (const row of [6, 11]) {
    sheet.getRow(row).height = 6;
  }
}
