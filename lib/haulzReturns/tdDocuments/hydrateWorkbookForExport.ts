import type { Pool, PoolClient } from "pg";
import { hydrateUlSheetFromParsed } from "../buildWorkbook.js";
import { parseUlBuffer } from "../parseUl.js";
import { loadJobFiles } from "../processJob.js";
import type { HaulzWorkbook, ParsedUlFile } from "../types.js";
import {
  syncAllUlSheetsFromControlKeys,
  ulNumbersWithInItog,
  ulSheetNeedsHydration,
} from "../ulTotals.js";

import type { TdPrepared } from "./types.js";

function fileDataToArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function parseUlNumberFromFilename(name: string): string | null {
  const m = /(\d{5,})/.exec(name);
  return m?.[1] ?? null;
}

async function loadParsedUlFiles(
  pool: Pool | PoolClient,
  jobId: number,
  onlyUlNumbers?: Set<string>,
): Promise<Map<string, ParsedUlFile>> {
  const files = await loadJobFiles(pool, jobId);
  const byUl = new Map<string, ParsedUlFile>();
  for (const file of files) {
    if (file.file_role !== "ul_prio1" && file.file_role !== "ul_prio2") continue;
    const fromName = parseUlNumberFromFilename(file.original_filename);
    if (onlyUlNumbers?.size) {
      const inSet =
        (fromName && onlyUlNumbers.has(fromName)) ||
        [...onlyUlNumbers].some((ul) => file.original_filename.includes(ul));
      if (!inSet) continue;
    }
    const parsed = parseUlBuffer(fileDataToArrayBuffer(file.file_data), file.original_filename);
    byUl.set(parsed.ulNumber, parsed);
    if (fromName && fromName !== parsed.ulNumber) {
      byUl.set(fromName, parsed);
    }
  }
  return byUl;
}

/** Нужна ли подгрузка УЛ из файлов БД (дорого на больших сессиях). */
export function tdExportNeedsUlHydration(
  workbook: HaulzWorkbook,
  tdPrepared?: TdPrepared | null,
): boolean {
  const hasPreparedSnapshot =
    (tdPrepared?.writeoffs?.length ?? 0) > 0 || (tdPrepared?.fixRows?.length ?? 0) > 0;
  if (hasPreparedSnapshot) return false;

  const wb = syncAllUlSheetsFromControlKeys(workbook);
  const ulInItog = ulNumbersWithInItog(wb);
  return wb.sheets.some((sheet) => ulSheetNeedsHydration(sheet, ulInItog));
}

/** Подгружает отложенные УЛ из файлов сессии перед экспортом ТД. */
export async function hydrateWorkbookForTdExport(
  pool: Pool | PoolClient,
  jobId: number,
  workbook: HaulzWorkbook,
): Promise<HaulzWorkbook> {
  let wb = syncAllUlSheetsFromControlKeys(workbook);
  const ulInItog = ulNumbersWithInItog(wb);
  const needsAny = wb.sheets.some((sheet) => ulSheetNeedsHydration(sheet, ulInItog));
  if (!needsAny) return wb;

  const ulNumbersToHydrate = new Set(
    wb.sheets
      .filter((sheet) => ulSheetNeedsHydration(sheet, ulInItog))
      .map((sheet) => (sheet.id.startsWith("ul-") ? sheet.id.slice(3) : ""))
      .filter(Boolean),
  );
  const parsedByUl = await loadParsedUlFiles(pool, jobId, ulNumbersToHydrate);
  if (parsedByUl.size === 0) return wb;

  const sheets = wb.sheets.map((sheet) => {
    if (!ulSheetNeedsHydration(sheet, ulInItog)) return sheet;
    const ulNumber = sheet.id.startsWith("ul-") ? sheet.id.slice(3) : "";
    const parsed = parsedByUl.get(ulNumber);
    if (!parsed) return sheet;
    return hydrateUlSheetFromParsed(sheet, parsed, wb.itogControlKeys);
  });

  return syncAllUlSheetsFromControlKeys({ ...wb, sheets });
}
