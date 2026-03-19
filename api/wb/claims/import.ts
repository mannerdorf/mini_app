import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as XLSX from "xlsx";
import { getPool } from "../../_db.js";
import { parseMultipart } from "../../_pnl-multipart.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { parseDateOnly, parseNum, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";
import { upsertDocument } from "../../../lib/rag.js";

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

function findHeaderRow(data: unknown[][]) {
  for (let i = 0; i < Math.min(50, data.length); i++) {
    const row = data[i] ?? [];
    const normalized = row.map(norm);
    const nonEmpty = normalized.filter(Boolean).length;
    const hasClaim = normalized.some((c) => c.includes("удерж") || c.includes("претенз"));
    if (hasClaim || nonEmpty >= 4) return i;
  }
  return 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_claims_import");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  const access = await resolveWbAccess(req, pool, "write");
  if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

  const client = await pool.connect();
  let batchId: number | null = null;
  try {
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

    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
    if (!data.length) return res.status(400).json({ error: "Пустой файл", request_id: ctx.requestId });

    const hIdx = findHeaderRow(data);
    const headerRaw = data[hIdx] ?? [];
    const headers = headerRaw.map((h, idx) => asText(h) || `Колонка_${idx + 1}`);

    let totalRows = 0;
    let insertedRows = 0;
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

      const claimNumber = asText(pick(normalizedMap, ["номер удержания", "номер претензии", "удержание", "претензия"]));
      const boxId = asText(pick(normalizedMap, ["id коробки", "номер коробки", "коробка", "id короб"]));
      const docNumber = asText(pick(normalizedMap, ["номер документа", "документ", "номер акта", "номер"]));
      const docDate = parseDateOnly(pick(normalizedMap, ["дата документа", "дата", "date"]));
      const description = asText(pick(normalizedMap, ["описание", "комментарий", "причина удержания"]));
      const amountRub = parseNum(pick(normalizedMap, ["сумма", "стоимость", "сумма удержания", "удержание руб"]));

      if (!boxId && !claimNumber && !description) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4::jsonb)`,
            [batchId, i + 1, "Пустая строка удержания", JSON.stringify({ allColumns })],
          );
        }
        continue;
      }

      await client.query(
        `insert into wb_claims_items (
           revision_id, row_number, claim_number, box_id, doc_number, doc_date, description, amount_rub, all_columns
         ) values (
           $1, $2, $3, $4, $5, $6::date, $7, $8, $9::jsonb
         )`,
        [revisionId, i + 1, claimNumber || null, boxId || null, docNumber || null, docDate, description || null, amountRub || null, JSON.stringify(allColumns)],
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
         set total_rows = $2, inserted_rows = $3, updated_rows = 0, skipped_rows = 0, error_rows = $4
         where id = $1`,
        [batchId, totalRows, insertedRows, errorRows],
      );
    }

    await client.query("commit");
    await rebuildWbSummary(pool);

    await writeAuditLog(pool, {
      action: "wb_claims_import_revision",
      target_type: "wb_claims_revision",
      target_id: revisionId,
      details: { revisionNumber, batchId, totalRows, insertedRows, errorRows, uploadedBy: access.login },
    });

    for (const doc of ragQueue) {
      try {
        await upsertDocument({
          sourceType: "wb_claims",
          sourceId: doc.sourceId,
          title: `WB claims rev ${revisionNumber}`,
          content: doc.content,
          metadata: doc.metadata,
        });
      } catch {
        // best-effort
      }
    }

    return res.status(200).json({
      ok: true,
      revisionId,
      revisionNumber,
      batchId,
      totalRows,
      insertedRows,
      errorRows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    logError(ctx, "wb_claims_import_failed", error);
    if (batchId) {
      try {
        await pool.query("update wb_inbound_import_batches set status = 'failed' where id = $1", [batchId]);
      } catch {
        // ignore
      }
    }
    return res.status(500).json({ error: "Ошибка импорта удержаний", request_id: ctx.requestId });
  } finally {
    client.release();
  }
}

