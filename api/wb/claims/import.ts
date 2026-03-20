import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import { getPool } from "../../_db.js";
import { parseMultipart } from "../../_pnl-multipart.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { parseNum, pgTableExists, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { parseCellDateFlexible } from "../_excelMeta.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

export const config = { api: { bodyParser: false } };

function asText(v: unknown) {
  return String(v ?? "").trim();
}
function norm(v: unknown) {
  return asText(v).toLowerCase().replace(/\s+/g, " ");
}
function pick(map: Map<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return "";
}

function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

/** Дата вида «04.06.2025 12:34» — берём только дату для parseCellDateFlexible. */
function wbDateCellValue(raw: unknown): unknown {
  if (raw instanceof Date) return raw;
  const s = String(raw ?? "").trim();
  if (!s) return raw;
  const head = s.split(/\s+/)[0] ?? "";
  if (/^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(head)) return head.replace(/\//g, ".");
  return raw;
}

/** Номер коробки из текста комментария WB («коробка 3427463670»). */
function boxIdFromComment(text: string): string {
  const m = text.match(/короб(?:ка|ки)?\s*[:\s]?\s*(\d{6,})/iu);
  return m?.[1] ? m[1].trim() : "";
}

function findHeaderRow(data: unknown[][]) {
  for (let i = 0; i < Math.min(50, data.length); i++) {
    const row = data[i] ?? [];
    const normalized = row.map(norm);
    const nonEmpty = normalized.filter(Boolean).length;
    const joined = normalized.join("|");
    const hasClaim = normalized.some((c) => c.includes("удерж") || c.includes("претенз"));
    const looksWbExport =
      joined.includes("штрихкод") &&
      (joined.includes("цена") || joined.includes("руб")) &&
      (joined.includes("id") || joined.includes("комментар"));
    if (hasClaim || looksWbExport || nonEmpty >= 4) return i;
  }
  return 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_claims_import");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let pool: Pool | null = null;
  let client: PoolClient | null = null;
  let batchId: number | null = null;
  try {
    pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_claims_revisions"))) {
      return res.status(503).json({
        error:
          "В базе нет таблиц удержаний/претензий (wb_claims_revisions). Выполните миграцию migrations/055_wildberries.sql.",
        request_id: ctx.requestId,
      });
    }

    client = await pool.connect();
    const { files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file");
    if (!file) return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });

    await client.query("begin");
    const batchResult = await client.query<{ id: number }>(
      `insert into wb_inbound_import_batches (block_type, mode, source_filename, uploaded_by_login, status)
       values ('claims', 'upsert', $1, $2, 'completed')
       returning id`,
      [file.originalFilename || "claims.xlsx", access.login],
    );
    batchId = batchResult.rows[0]?.id ?? null;

    const { rows: revRows } = await client.query<{ n: number }>(
      "select coalesce(max(revision_number), 0) + 1 as n from wb_claims_revisions",
    );
    const revisionNumber = revRows[0]?.n ?? 1;

    await client.query("update wb_claims_revisions set is_active = false where is_active = true");
    const revisionInsert = await client.query<{ id: number }>(
      `insert into wb_claims_revisions (revision_number, source_filename, uploaded_by_login, is_active, batch_id)
       values ($1, $2, $3, true, $4)
       returning id`,
      [revisionNumber, file.originalFilename || "claims.xlsx", access.login, batchId],
    );
    const revisionId = revisionInsert.rows[0]?.id;
    if (!revisionId) throw new Error("Не удалось создать ревизию удержаний");

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    } catch (e) {
      throw new Error(`Не удалось прочитать Excel: ${(e as Error)?.message || e}`);
    }
    const names = wb.SheetNames || [];
    let data: unknown[][] | null = null;
    for (const name of names) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
      if (sheetData.some((r) => (r ?? []).some((c) => asText(c)))) {
        data = sheetData;
        break;
      }
    }
    if (!data?.length) {
      return res.status(400).json({ error: "Пустой файл или нет данных на листах", request_id: ctx.requestId });
    }

    const hIdx = findHeaderRow(data);
    const headerRaw = data[hIdx] ?? [];
    const headers = headerRaw.map((h, idx) => asText(h) || `Колонка_${idx + 1}`);

    const fileHasStatusColumn = headers.some((h) => {
      const n = norm(h);
      return n === "статус" || n === "status" || n === "состояние";
    });

    function isConfirmedWbStatus(raw: unknown): boolean {
      const s = norm(raw).replace(/ё/g, "е").replace(/Ё/g, "е");
      return s === "подтверждено";
    }

    let totalRows = 0;
    let insertedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const ragQueue: Array<{ sourceId: string; content: string; metadata: Record<string, unknown> }> = [];

    for (let i = hIdx + 1; i < data.length; i++) {
      const row = data[i] ?? [];
      if (row.every((v) => !asText(v))) continue;
      totalRows++;

      const allColumns: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        allColumns[h] = row[idx] ?? null;
      });
      const normalizedMap = new Map<string, unknown>();
      for (const [k, v] of Object.entries(allColumns)) normalizedMap.set(norm(k), v);

      if (fileHasStatusColumn) {
        const statusVal = pick(normalizedMap, ["статус", "status", "состояние"]);
        if (!isConfirmedWbStatus(statusVal)) {
          skippedRows++;
          continue;
        }
      }

      const claimNumber = asText(
        pick(normalizedMap, [
          "id",
          "id заявки на оплату",
          "номер удержания",
          "номер претензии",
          "удержание",
          "претензия",
          "номер штрафа",
          "штраф",
          "№ удержания",
          "№ претензии",
        ]),
      );
      let boxId = asText(
        pick(normalizedMap, [
          "id коробки",
          "номер коробки",
          "коробка",
          "id короб",
          "box id",
          "идентификатор коробки",
        ]),
      );
      const barcodeShk = asText(
        pick(normalizedMap, ["штрихкод", "шк", "баркод", "barcode"]),
      );
      const docNumber = asText(
        pick(normalizedMap, [
          "id заявки на оплату",
          "номер документа",
          "документ",
          "номер акта",
          "номер",
        ]),
      );
      const docDate = parseCellDateFlexible(
        wbDateCellValue(
          pick(normalizedMap, [
            "дата претензии",
            "дата заявки на оплату",
            "дата документа",
            "дата",
            "date",
          ]),
        ),
      );
      const description = asText(
        pick(normalizedMap, ["описание", "комментарий", "причина удержания"]),
      );
      if (!boxId && description) {
        const fromComm = boxIdFromComment(description);
        if (fromComm) boxId = fromComm;
      }
      /** ШК храним отдельно — по нему сводная ищет строку в «Описи»; в box_id только реальный номер коробки. */
      const amountRub = parseNum(
        pick(normalizedMap, [
          "цена, руб.",
          "цена руб.",
          "цена, руб",
          "цена руб",
          "сумма",
          "стоимость",
          "сумма удержания",
          "удержание руб",
        ]),
      );

      if (!boxId && !claimNumber && !description && !barcodeShk) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4::jsonb)`,
            [batchId, i + 1, "Пустая строка удержания", safeJsonStringify({ allColumns })],
          );
        }
        continue;
      }

      await client.query(
        `insert into wb_claims_items (
           revision_id, row_number, claim_number, box_id, shk, doc_number, doc_date, description, amount_rub, all_columns
         ) values (
           $1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10::jsonb
         )`,
        [
          revisionId,
          i + 1,
          claimNumber || null,
          boxId || null,
          barcodeShk || null,
          docNumber || null,
          docDate,
          description || null,
          Number.isFinite(amountRub) ? amountRub : null,
          safeJsonStringify(allColumns),
        ],
      );
      insertedRows++;

      if (ragQueue.length < 500) {
        ragQueue.push({
          sourceId: `${revisionNumber}:${i + 1}:${boxId || claimNumber || "row"}`,
          content: [
            `Ревизия: ${revisionNumber}`,
            `Номер удержания: ${claimNumber || "-"}`,
            `ID коробки: ${boxId || "-"}`,
            `Документ: ${docNumber || "-"}`,
            `Дата: ${docDate || "-"}`,
            `Описание: ${description || "-"}`,
            `Сумма: ${amountRub || 0}`,
          ].join("\n"),
          metadata: {
            block: "claims",
            revisionNumber,
            revisionId,
            claimNumber,
            boxId,
            docNumber,
            docDate,
          },
        });
      }
    }

    if (batchId) {
      await client.query(
        `update wb_inbound_import_batches
         set total_rows = $2, inserted_rows = $3, updated_rows = 0, skipped_rows = $4, error_rows = $5
         where id = $1`,
        [batchId, totalRows, insertedRows, skippedRows, errorRows],
      );
    }

    await client.query("commit");

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

    await writeAuditLog(pool, {
      action: "wb_claims_import_revision",
      target_type: "wb_claims_revision",
      target_id: revisionId,
      details: { revisionNumber, batchId, totalRows, insertedRows, skippedRows, errorRows, uploadedBy: access.login },
    });

    const ragToFlush = ragQueue.slice();
    const revNum = revisionNumber;
    void (async () => {
      try {
        const { upsertDocument } = await import("../../../lib/rag.js");
        for (const doc of ragToFlush) {
          try {
            await upsertDocument({
              sourceType: "wb_claims",
              sourceId: doc.sourceId,
              title: `WB claims rev ${revNum}`,
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
      revisionId,
      revisionNumber,
      batchId,
      totalRows,
      insertedRows,
      skippedRows,
      errorRows,
      summaryRebuildAsync: true,
      request_id: ctx.requestId,
    });
  } catch (error) {
    if (client) await client.query("rollback").catch(() => {});
    logError(ctx, "wb_claims_import_failed", error);
    if (batchId && pool) {
      try {
        await pool.query("update wb_inbound_import_batches set status = 'failed' where id = $1", [batchId]);
      } catch {
        // ignore
      }
    }
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Ошибка импорта удержаний";
    const safe = message.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
    return res.status(500).json({
      error: safe || "Ошибка импорта удержаний",
      request_id: ctx.requestId,
    });
  } finally {
    try {
      client?.release();
    } catch {
      /* ignore */
    }
  }
}

