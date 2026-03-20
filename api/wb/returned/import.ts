import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PoolClient } from "pg";
import * as XLSX from "xlsx";
import { getPool } from "../../_db.js";
import { parseMultipart } from "../../_pnl-multipart.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import {
  parseBooleanFlag,
  parseDateOnly,
  parseNum,
  pgTableExists,
  rebuildWbSummary,
  resolveWbAccess,
} from "../../_wb.js";
import { parseCellDateFlexible, readSheetCellRaw } from "../_excelMeta.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

export const config = { api: { bodyParser: false } };

function asText(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return asText(v).toLowerCase().replace(/\s+/g, " ");
}

function findHeader(data: unknown[][]) {
  for (let i = 0; i < Math.min(40, data.length); i++) {
    const row = data[i] ?? [];
    const hasBox = row.some((c) => norm(c).includes("короб"));
    if (hasBox) return i;
  }
  return -1;
}

/** Шаблон: один столбец с ID коробок (только цифры, без шапки «номер коробки»). */
function detectSingleColumnBoxIdCol(data: unknown[][]): number | null {
  let withData = 0;
  let singleDigitCol = 0;
  const colHits = new Map<number, number>();
  const maxScan = Math.min(data.length, 500);
  for (let i = 0; i < maxScan; i++) {
    const row = data[i] ?? [];
    const nonEmptyIdx: number[] = [];
    for (let j = 0; j < row.length; j++) {
      if (asText(row[j])) nonEmptyIdx.push(j);
    }
    if (nonEmptyIdx.length === 0) continue;
    withData++;
    if (nonEmptyIdx.length !== 1) continue;
    const col = nonEmptyIdx[0]!;
    const v = asText(row[col]).replace(/\s+/g, "");
    if (/^\d{6,}$/.test(v)) {
      singleDigitCol++;
      colHits.set(col, (colHits.get(col) ?? 0) + 1);
    }
  }
  if (withData < 3) return null;
  if (singleDigitCol / withData < 0.75) return null;
  let best = -1;
  let bestN = 0;
  for (const [c, n] of colHits) {
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best >= 0 ? best : null;
}

/** Номер ведомости из имени файла, напр. ..._208484996 (3).xlsx */
function docNumberFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "");
  const runs = base.match(/\d{6,}/g);
  if (!runs?.length) return "";
  return runs.reduce((a, b) => (b.length >= a.length ? b : a), runs[0]!);
}

function pick(row: unknown[], headerMap: Map<string, number>, keys: string[]) {
  for (const k of keys) {
    const idx = headerMap.get(k);
    if (idx != null && idx >= 0) return row[idx];
  }
  return "";
}

/** Ячейка как в Excel: row/col с 1 (A1 → 1,1). */
function cellRC(data: unknown[][], row1: number, col1: number): unknown {
  const r = data[row1 - 1];
  if (!r) return undefined;
  return r[col1 - 1];
}

/**
 * Шаблон «Возвратная опись» (в т.ч. Калининград): номер в F2, дата в O2 (часто текст 23.04.2025).
 * Чтение с ws по A1 — иначе O2 теряется в sheet_to_json.
 */
function parseVozvratnayaOpisySheetMeta(data: unknown[][], ws: XLSX.WorkSheet): { docNumber: string; docDate: string | null } {
  const f2 = readSheetCellRaw(ws, "F2") ?? cellRC(data, 2, 6);
  const o2 = readSheetCellRaw(ws, "O2") ?? cellRC(data, 2, 15);
  const rawNum = asText(f2);
  const docNumber = rawNum.replace(/[^\d]/g, "") || rawNum;
  const docDate = parseCellDateFlexible(o2);
  return { docNumber, docDate };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_returned_import");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let client: PoolClient | null = null;
  let batchId: number | null = null;
  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_returned_items"))) {
      return res.status(503).json({
        error:
          "В базе нет таблицы wb_returned_items. Выполните миграцию Wildberries: migrations/055_wildberries.sql (или полный набор миграций проекта).",
        request_id: ctx.requestId,
      });
    }

    client = await pool.connect();
    const { fields, files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file");
    if (!file) return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    const mode = String(fields.mode || "append").trim().toLowerCase() === "upsert" ? "upsert" : "append";

    const batchResult = await client.query<{ id: number }>(
      `insert into wb_inbound_import_batches (block_type, mode, source_filename, uploaded_by_login, status)
       values ('returned', $1, $2, $3, 'completed')
       returning id`,
      [mode, file.originalFilename || "returned.xlsx", access.login],
    );
    batchId = batchResult.rows[0]?.id ?? null;

    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const firstSheet = wb.SheetNames?.[0];
    const ws = firstSheet ? wb.Sheets[firstSheet] : undefined;
    if (!ws) return res.status(400).json({ error: "Пустой файл", request_id: ctx.requestId });
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
    if (!data.length) return res.status(400).json({ error: "Пустой файл", request_id: ctx.requestId });

    const hIdx = findHeader(data);
    const singleBoxCol = hIdx < 0 ? detectSingleColumnBoxIdCol(data) : null;
    if (hIdx < 0 && singleBoxCol == null) {
      return res.status(400).json({
        error:
          "Не найден заголовок с колонкой коробки. Ожидается таблица с заголовком или один столбец с ID коробок (от 6 цифр).",
        request_id: ctx.requestId,
      });
    }
    const header = singleBoxCol == null ? (data[hIdx] ?? []) : [];
    const hm = new Map<string, number>();
    header.forEach((c, i) => hm.set(norm(c), i));
    /** «Возвратная опись»: F2 — номер ведомости, O2 — дата (если не в колонках строк). */
    const sheetMeta = parseVozvratnayaOpisySheetMeta(data, ws);
    const fileDocHint = docNumberFromFilename(file.originalFilename || "");

    let totalRows = 0;
    let insertedRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const ragQueue: Array<{ sourceId: string; content: string; metadata: Record<string, unknown> }> = [];

    const dataStartRow = singleBoxCol != null ? 0 : hIdx + 1;

    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i] ?? [];
      let boxId = "";
      if (singleBoxCol != null) {
        boxId = asText(row[singleBoxCol]).replace(/\s+/g, "");
        if (!boxId || !/^\d{6,}$/.test(boxId)) continue;
      } else {
        boxId = asText(pick(row, hm, ["id коробки", "номер коробки", "коробка"]));
      }
      const cargoNumber = singleBoxCol != null ? "" : asText(pick(row, hm, ["номер груза", "перевозка", "cargo number"]));
      const description = singleBoxCol != null ? "" : asText(pick(row, hm, ["описание", "комментарий"]));
      let docNumber = singleBoxCol
        ? ""
        : asText(
            pick(row, hm, ["номер документа", "документ", "номер претензии", "номер ведомости", "ведомость"]),
          );
      if (!docNumber && sheetMeta.docNumber) docNumber = sheetMeta.docNumber;
      if (!docNumber && fileDocHint) docNumber = fileDocHint;
      let docDate = singleBoxCol
        ? null
        : parseDateOnly(pick(row, hm, ["дата", "дата документа", "дата ведомости"]));
      if (!docDate && sheetMeta.docDate) docDate = sheetMeta.docDate;
      /** Одностолбцовый импорт: суммы в файле нет — в БД NULL, чтобы сводка брала цену из «Описей» (не 0, иначе coalesce не срабатывал). */
      const amount = singleBoxCol != null ? null : parseNum(pick(row, hm, ["стоимость", "сумма", "цена"]));
      const hasShk = parseBooleanFlag(
        singleBoxCol != null ? "" : pick(row, hm, ["есть шк", "has shk"]),
        true,
      );

      if (!boxId && !cargoNumber && !description) continue;
      totalRows++;
      if (!boxId) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4::jsonb)`,
            [batchId, i + 1, "Не указан ID/номер коробки", JSON.stringify({ row })],
          );
        }
        continue;
      }

      if (mode === "append") {
        await client.query(
          `insert into wb_returned_items (
             batch_id, source, box_id, cargo_number, description, has_shk, document_number, document_date, amount_rub, raw_row, source_row_number
           ) values (
             $1, 'import', $2, $3, $4, $5, $6, $7::date, $8, $9::jsonb, $10
           )`,
          [
            batchId,
            boxId,
            cargoNumber || null,
            description || null,
            hasShk,
            docNumber || null,
            docDate,
            Number.isFinite(amount) ? amount : null,
            JSON.stringify({ row }),
            i + 1,
          ],
        );
        insertedRows++;
      } else {
        await client.query(
          `delete from wb_returned_items where source = 'import' and box_id = $1 and coalesce(document_number, '') = coalesce($2, '')`,
          [boxId, docNumber || null],
        );
        await client.query(
          `insert into wb_returned_items (
             batch_id, source, box_id, cargo_number, description, has_shk, document_number, document_date, amount_rub, raw_row, source_row_number
           ) values (
             $1, 'import', $2, $3, $4, $5, $6, $7::date, $8, $9::jsonb, $10
           )`,
          [
            batchId,
            boxId,
            cargoNumber || null,
            description || null,
            hasShk,
            docNumber || null,
            docDate,
            Number.isFinite(amount) ? amount : null,
            JSON.stringify({ row }),
            i + 1,
          ],
        );
        updatedRows++;
      }

      if (ragQueue.length < 300) {
        ragQueue.push({
          sourceId: `${boxId}:${docNumber || "doc"}`,
          content: [
            `ID коробки: ${boxId}`,
            `Номер груза: ${cargoNumber || "-"}`,
            `Документ: ${docNumber || "-"}`,
            `Дата: ${docDate || "-"}`,
            `Описание: ${description || "-"}`,
            `Стоимость: ${amount || 0}`,
          ].join("\n"),
          metadata: { block: "returned", boxId, cargoNumber, docNumber, docDate },
        });
      }
    }

    if (batchId) {
      await client.query(
        `update wb_inbound_import_batches
         set total_rows = $2, inserted_rows = $3, updated_rows = $4, skipped_rows = $5, error_rows = $6
         where id = $1`,
        [batchId, totalRows, insertedRows, updatedRows, skippedRows, errorRows],
      );
      await writeAuditLog(pool, {
        action: "wb_returned_import",
        target_type: "wb_returned_batch",
        target_id: batchId,
        details: { mode, totalRows, insertedRows, updatedRows, skippedRows, errorRows, uploadedBy: access.login },
      });
    }

    void rebuildWbSummary(pool).catch((err) => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "wb_rebuild_summary_deferred_failed",
          route: ctx.route,
          request_id: ctx.requestId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });

    const ragToFlush = ragQueue.slice();
    void (async () => {
      try {
        const { upsertDocument } = await import("../../../lib/rag.js");
        for (const doc of ragToFlush) {
          try {
            await upsertDocument({
              sourceType: "wb_returned",
              sourceId: doc.sourceId,
              title: "WB returned",
              content: doc.content,
              metadata: doc.metadata,
            });
          } catch {
            // best-effort
          }
        }
      } catch {
        // RAG недоступен
      }
    })().catch(() => {});

    return res.status(200).json({
      ok: true,
      batchId,
      mode,
      totalRows,
      insertedRows,
      updatedRows,
      skippedRows,
      errorRows,
      summaryRebuildAsync: true,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_returned_import_failed", error);
    if (batchId && client) {
      try {
        await client.query("update wb_inbound_import_batches set status = 'failed' where id = $1", [batchId]);
      } catch {
        // ignore
      }
    }
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Ошибка импорта возвращенного груза";
    const safe = message.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
    return res.status(500).json({ error: safe || "Ошибка импорта возвращенного груза", request_id: ctx.requestId });
  } finally {
    try {
      client?.release();
    } catch {
      /* ignore */
    }
  }
}

