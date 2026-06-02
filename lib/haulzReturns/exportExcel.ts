import type { HaulzSheet, HaulzSheetRow, HaulzWorkbook } from "./types";
import { FIX_COLUMNS, ITog_HEADERS } from "./types";
import { isSummaryRow, isUlRowInItog, stripSummaryRows } from "./ulTotals.js";
import {
  itogRowHighlight,
  itogUlDataHighlight,
  UL_HIGHLIGHT,
} from "./validators";

function argb(hex: string): string {
  const h = hex.replace("#", "");
  return `FF${h.toUpperCase()}`;
}

function applyItogRowStyle(
  sheet: import("exceljs").Worksheet,
  rowIndex: number,
  row: Record<string, unknown>,
) {
  const validation = {
    englishOnly: Boolean(row.englishOnly),
    au585: Boolean(row.au585),
    digitsOnly: Boolean(row.digitsOnly),
    pinkList: Boolean(row.pinkList),
  };
  const rowColor = itogRowHighlight(validation);
  const fColor = itogUlDataHighlight(validation);

  const cols = ITog_HEADERS.length;
  for (let c = 1; c <= cols; c++) {
    const cell = sheet.getCell(rowIndex, c);
    if (rowColor && c <= 15) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(rowColor) } };
    }
  }
  if (fColor) {
    const fCell = sheet.getCell(rowIndex, 6);
    fCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fColor) } };
  }
}

function applyUlRowStyle(sheet: import("exceljs").Worksheet, rowIndex: number, row: HaulzSheetRow) {
  if (!isUlRowInItog(row)) return;
  for (let c = 1; c <= 14; c++) {
    sheet.getCell(rowIndex, c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(UL_HIGHLIGHT) },
    };
  }
}

function writeSheet(
  wb: import("exceljs").Workbook,
  haulzSheet: HaulzSheet,
  options?: { skipValidationCols?: boolean },
) {
  const ws = wb.addWorksheet(haulzSheet.name);
  const columns =
    options?.skipValidationCols && haulzSheet.id === "fix"
      ? FIX_COLUMNS
      : haulzSheet.columns;

  const summaryRow = haulzSheet.rows.find(isSummaryRow) ?? null;
  const dataRows = stripSummaryRows(haulzSheet.rows);
  let excelRow = 1;

  if (summaryRow) {
    ws.addRow(
      columns.map((c) => {
        const v = summaryRow[c.key];
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
        return v ?? "";
      }),
    );
    for (let c = 1; c <= columns.length; c++) {
      const cell = ws.getCell(excelRow, c);
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#fff8e6") } };
    }
    excelRow++;
  }

  ws.addRow(columns.map((c) => c.label));
  excelRow++;

  dataRows.forEach((row) => {
    const values = columns.map((c) => {
      const v = row[c.key];
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return v ?? "";
    });
    ws.addRow(values);
    if (haulzSheet.id === "itog") {
      applyItogRowStyle(ws, excelRow, row);
    } else if (haulzSheet.id.startsWith("ul-")) {
      applyUlRowStyle(ws, excelRow, row);
    }
    excelRow++;
  });
}

export async function exportSheetToExcel(haulzSheet: HaulzSheet): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
  const wb = new Workbook();
  writeSheet(wb, haulzSheet, { skipValidationCols: haulzSheet.id === "fix" });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function exportWorkbookToExcel(workbook: HaulzWorkbook): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
  const wb = new Workbook();
  for (const sheet of workbook.sheets) {
    writeSheet(wb, sheet, { skipValidationCols: sheet.id === "fix" });
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
