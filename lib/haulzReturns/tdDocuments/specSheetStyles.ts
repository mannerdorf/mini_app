import type { Cell, Style } from "exceljs";

export const SPEC_FONT = "Calibri";
export const SPEC_FONT_SIZE = 10;
export const SPEC_RED = "FFFF0000";

export const SPEC_TABLE_BORDER: Partial<Style["border"]> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

type CellStyleOpts = {
  bold?: boolean;
  red?: boolean;
  borders?: boolean;
};

export function applySpecCellStyle(cell: Cell, opts: CellStyleOpts = {}) {
  cell.font = {
    name: SPEC_FONT,
    size: SPEC_FONT_SIZE,
    bold: opts.bold ?? false,
    ...(opts.red ? { color: { argb: SPEC_RED } } : {}),
  };
  cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  if (opts.borders !== false) {
    cell.border = { ...SPEC_TABLE_BORDER };
  }
}

export function applySpecTableRangeBorders(
  sheet: import("exceljs").Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
) {
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const cell = sheet.getCell(r, c);
      if (!cell.font?.name) {
        applySpecCellStyle(cell, { borders: true });
      } else {
        cell.border = { ...SPEC_TABLE_BORDER };
      }
    }
  }
}
