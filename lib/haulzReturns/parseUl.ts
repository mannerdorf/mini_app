import type { ParsedUlFile, UlDataRow } from "./types.js";
import {
  cellText,
  colIndexByHeader,
  extractUlDateFromTitle,
  extractUlNumberFromFileName,
  extractUlNumberFromTitle,
  findHeaderRowIndex,
  readWorkbookFromArrayBuffer,
  sheetToMatrix,
} from "./excelUtils.js";

function parseUlMatrix(matrix: unknown[][], fileName: string): ParsedUlFile {
  const headerIdx = findHeaderRowIndex(matrix, [
    (n) => n.includes("номер") && n.includes("п/п"),
    (n) => n.includes("грузов") && n.includes("мест"),
    (n) => n.includes("посыл"),
  ]);
  if (headerIdx < 0) {
    throw new Error(`«${fileName}»: не найдена шапка УЛ`);
  }

  const headerRow = matrix[headerIdx] ?? [];
  const col = {
    rowNum: colIndexByHeader(headerRow, (n) => n.includes("номер") && n.includes("п/п")),
    cargo: colIndexByHeader(headerRow, (n) => n.includes("грузов") && n.includes("мест")),
    parcel: colIndexByHeader(headerRow, (n) => n.includes("посыл")),
    airport: colIndexByHeader(headerRow, (n) => n.includes("аэропорт")),
    weight: colIndexByHeader(headerRow, (n) => n.includes("вес")),
    volume: colIndexByHeader(headerRow, (n) => n.includes("объем") || n.includes("объём")),
    category: colIndexByHeader(headerRow, (n) => n.includes("категор")),
    name: colIndexByHeader(headerRow, (n) => n.includes("наимен")),
    qty: colIndexByHeader(headerRow, (n) => n === "кол-во" || n.startsWith("кол")),
    cost: colIndexByHeader(headerRow, (n) => n.includes("стоим")),
  };

  let ulNumber = extractUlNumberFromFileName(fileName);
  let ulDate: string | null = null;
  for (let r = 0; r < headerIdx; r++) {
    for (const cell of matrix[r] ?? []) {
      const text = cellText(cell);
      if (!ulNumber) {
        const fromTitle = extractUlNumberFromTitle(text);
        if (fromTitle) ulNumber = fromTitle;
      }
      if (!ulDate) {
        const fromTitle = extractUlDateFromTitle(text);
        if (fromTitle) ulDate = fromTitle;
      }
    }
  }
  if (!ulNumber) {
    throw new Error(`«${fileName}»: не удалось определить номер УЛ из имени файла или заголовка`);
  }

  const rows: UlDataRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const rowNum = cellText(row[col.rowNum >= 0 ? col.rowNum : 0]);
    const cargoPlace = cellText(row[col.cargo >= 0 ? col.cargo : 1]);
    const parcel = cellText(row[col.parcel >= 0 ? col.parcel : 2]);
    if (!rowNum && !cargoPlace && !parcel) {
      if (rows.length > 0) break;
      continue;
    }
    rows.push({
      rowNum,
      cargoPlace,
      parcel,
      airport: cellText(row[col.airport >= 0 ? col.airport : 3]),
      weight: row[col.weight >= 0 ? col.weight : 4] as string | number,
      volume: row[col.volume >= 0 ? col.volume : 5] as string | number,
      category: cellText(row[col.category >= 0 ? col.category : 6]),
      name: cellText(row[col.name >= 0 ? col.name : 7]),
      qty: row[col.qty >= 0 ? col.qty : 8] as string | number,
      cost: row[col.cost >= 0 ? col.cost : 9] as string | number,
    });
  }

  if (rows.length === 0) {
    throw new Error(`«${fileName}»: нет строк данных`);
  }

  return {
    fileName,
    ulNumber,
    ulDate,
    sheet: { ulNumber, rows },
  };
}

export function parseUlBuffer(buffer: ArrayBuffer, fileName: string): ParsedUlFile {
  const wb = readWorkbookFromArrayBuffer(buffer);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(`«${fileName}»: пустой файл`);
  return parseUlMatrix(sheetToMatrix(wb.Sheets[sheetName]), fileName);
}

export function mergeUlFiles(priority1: ParsedUlFile[], priority2: ParsedUlFile[]): ParsedUlFile[] {
  const byNumber = new Map<string, ParsedUlFile>();
  for (const f of priority2) byNumber.set(f.ulNumber, f);
  for (const f of priority1) byNumber.set(f.ulNumber, f);
  return [...byNumber.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
    .map(([, f]) => f);
}

export { parseUlMatrix };
