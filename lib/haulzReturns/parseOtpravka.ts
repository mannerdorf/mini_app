import type { OtpravkaRow } from "./types.js";
import {
  cellText,
  colIndexByHeader,
  findHeaderRowIndex,
  readWorkbookFromArrayBuffer,
  sheetToMatrix,
  normalizeHeader,
} from "./excelUtils.js";

export function parseOtpravkaBuffer(buffer: ArrayBuffer, fileName?: string): OtpravkaRow[] {
  const wb = readWorkbookFromArrayBuffer(buffer);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Файл отправки пуст");
  const matrix = sheetToMatrix(wb.Sheets[sheetName]);

  const headerIdx = findHeaderRowIndex(matrix, [
    (n) => n.includes("номер") && n.includes("п/п"),
    (n) => n.includes("грузов") && n.includes("мест"),
    (n) => n.includes("посыл"),
  ]);
  if (headerIdx < 0) {
    throw new Error(`«${fileName ?? "отправка"}»: не найдена строка заголовков (Номер п/п / Грузовое место / Номер посылки)`);
  }

  const headerRow = matrix[headerIdx] ?? [];
  let cargoCol = colIndexByHeader(headerRow, (n) => n.includes("грузов") && n.includes("мест"));
  let parcelCol = colIndexByHeader(headerRow, (n) => n.includes("посыл"));

  if (cargoCol < 0) cargoCol = 1;
  if (parcelCol < 0) parcelCol = 2;

  const rows: OtpravkaRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const cargoPlace = cellText(row[cargoCol]);
    const parcel = cellText(row[parcelCol]);
    if (!cargoPlace && !parcel) {
      if (rows.length > 0) break;
      continue;
    }
    if (!parcel) continue;
    rows.push({ cargoPlace, parcel });
  }

  if (rows.length === 0) {
    throw new Error(`«${fileName ?? "отправка"}»: нет строк с номером посылки`);
  }
  return rows;
}

/** Для тестов: парсинг из матрицы */
export function parseOtpravkaMatrix(matrix: unknown[][]): OtpravkaRow[] {
  const headerIdx = findHeaderRowIndex(matrix, [
    (n) => n.includes("номер") && (n.includes("п/п") || n === "номер п/п"),
    (n) => n.includes("посыл"),
  ]);
  if (headerIdx < 0) throw new Error("header not found");
  const headerRow = matrix[headerIdx] ?? [];
  const cargoColRaw = colIndexByHeader(headerRow, (n) => n.includes("грузов") && n.includes("мест"));
  const parcelColRaw = colIndexByHeader(headerRow, (n) => n.includes("посыл"));
  const cargoCol = cargoColRaw >= 0 ? cargoColRaw : 1;
  const parcelCol = parcelColRaw >= 0 ? parcelColRaw : 2;
  const rows: OtpravkaRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const parcel = cellText(row[parcelCol]);
    if (!parcel) break;
    rows.push({ cargoPlace: cellText(row[cargoCol]), parcel });
  }
  return rows;
}

export function detectOtpravkaColumns(headerRow: unknown[]): { cargoCol: number; parcelCol: number } {
  const cargoCol = colIndexByHeader(headerRow, (n) => n.includes("грузов") && n.includes("мест"));
  const parcelCol = colIndexByHeader(headerRow, (n) => n.includes("посыл"));
  return { cargoCol, parcelCol };
}

export { normalizeHeader };
