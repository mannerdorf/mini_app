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

function normalizeHeaderCell(v: unknown) {
  return asText(v).toLowerCase().replace(/\s+/g, " ");
}

function findHeaderRow(data: unknown[][]) {
  for (let i = 0; i < Math.min(40, data.length); i++) {
    const row = data[i] ?? [];
    const normalized = row.map(normalizeHeaderCell);
    const hasBox = normalized.some((c) => c.includes("номер коробки"));
    const hasShk = normalized.some((c) => c === "шк" || c.includes(" шк"));
    if (hasBox && hasShk) return i;
  }
  return -1;
}

function parseInventoryMeta(data: unknown[][]) {
  let inventoryNumber = "";
  let inventoryDate: string | null = null;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] ?? [];
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeaderCell(row[j]);
      if (!cell) continue;
      if (cell.includes("номер ввозной описи")) {
        inventoryNumber = asText(row[j + 1] ?? row[j + 2] ?? "");
      }
      if (cell.includes("дата создания ввозной описи")) {
        const raw = row[j + 1] ?? row[j + 2] ?? "";
        inventoryDate = parseDateOnly(raw);
      }
    }
  }
  return { inventoryNumber, inventoryDate };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_inbound_import");
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
    const { fields, files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file");
    if (!file) return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    const mode = String(fields.mode || "append").trim().toLowerCase() === "upsert" ? "upsert" : "append";

    const batchResult = await client.query<{ id: number }>(
      `insert into wb_inbound_import_batches (block_type, mode, source_filename, uploaded_by_login, status)
       values ('inbound', $1, $2, $3, 'completed')
       returning id`,
      [mode, file.originalFilename || "upload.xlsx", access.login],
    );
    batchId = batchResult.rows[0]?.id ?? null;

    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
    if (!data.length) return res.status(400).json({ error: "Пустой файл", request_id: ctx.requestId });

    const headerRowIdx = findHeaderRow(data);
    if (headerRowIdx < 0) {
      return res.status(400).json({ error: "Не найдена строка заголовков описи", request_id: ctx.requestId });
    }
    const { inventoryNumber: invMeta, inventoryDate } = parseInventoryMeta(data);
    const header = data[headerRowIdx] ?? [];
    const headerMap = new Map<string, number>();
    header.forEach((cell, idx) => headerMap.set(normalizeHeaderCell(cell), idx));
    const col = (name: string) => headerMap.get(name) ?? -1;

    const idxBox = col("номер коробки");
    const idxShk = col("шк");
    if (idxBox < 0 || idxShk < 0) {
      return res.status(400).json({ error: "Не найдены обязательные колонки: Номер коробки / ШК", request_id: ctx.requestId });
    }
    const idxSticker = col("стикер");
    const idxBarcode = col("баркод");
    const idxPhone = col("контактный номер физ. лица");
    const idxReceiver = col("фио получателя физ. лица");
    const idxArticle = col("артикул");
    const idxBrand = col("бренд");
    const idxNomenclature = col("номенклатура");
    const idxSize = col("размер");
    const idxDescription = col("описание");
    const idxKit = col("комплектация");
    const idxPrice = col("цена, rub");
    const idxTnved = col("тнвэд");
    const idxMass = col("масса");

    let totalRows = 0;
    let insertedRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const ragQueue: Array<{ sourceId: string; content: string; metadata: Record<string, unknown> }> = [];

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i] ?? [];
      const boxNumber = asText(row[idxBox]);
      const shk = asText(row[idxShk]);
      if (!boxNumber && !shk) continue;
      totalRows++;
      const inventoryNumber = invMeta || asText((row[col("номер ввозной описи")] ?? ""));
      const invDateRaw = row[col("дата создания ввозной описи")] ?? inventoryDate ?? "";
      const inventoryCreatedAt = parseDateOnly(invDateRaw);
      if (!inventoryNumber || !boxNumber || !shk) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4)`,
            [batchId, i + 1, "Пустой ключ (опись/коробка/ШК)", JSON.stringify({ row })],
          );
        }
        continue;
      }

      const values = [
        batchId,
        inventoryNumber,
        inventoryCreatedAt,
        i + 1,
        boxNumber,
        shk,
        idxSticker >= 0 ? asText(row[idxSticker]) : null,
        idxBarcode >= 0 ? asText(row[idxBarcode]) : null,
        idxPhone >= 0 ? asText(row[idxPhone]) : null,
        idxReceiver >= 0 ? asText(row[idxReceiver]) : null,
        idxArticle >= 0 ? asText(row[idxArticle]) : null,
        idxBrand >= 0 ? asText(row[idxBrand]) : null,
        idxNomenclature >= 0 ? asText(row[idxNomenclature]) : null,
        idxSize >= 0 ? asText(row[idxSize]) : null,
        idxDescription >= 0 ? asText(row[idxDescription]) : null,
        idxKit >= 0 ? asText(row[idxKit]) : null,
        idxPrice >= 0 ? parseNum(row[idxPrice]) : 0,
        idxTnved >= 0 ? asText(row[idxTnved]) : null,
        idxMass >= 0 ? parseNum(row[idxMass]) : 0,
        JSON.stringify({ row }),
      ];

      if (mode === "append") {
        const result = await client.query(
          `insert into wb_inbound_items (
             batch_id, inventory_number, inventory_created_at, row_number, box_number, shk,
             sticker, barcode, phone, receiver_full_name, article, brand, nomenclature, size, description, kit,
             price_rub, tnv_ed, mass_kg, raw_row
           ) values (
             $1, $2, $3::date, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20::jsonb
           )
           on conflict (inventory_number, box_number, shk) do nothing`,
          values,
        );
        if (result.rowCount && result.rowCount > 0) insertedRows++;
        else skippedRows++;
      } else {
        await client.query(
          `insert into wb_inbound_items (
             batch_id, inventory_number, inventory_created_at, row_number, box_number, shk,
             sticker, barcode, phone, receiver_full_name, article, brand, nomenclature, size, description, kit,
             price_rub, tnv_ed, mass_kg, raw_row, updated_at
           ) values (
             $1, $2, $3::date, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20::jsonb, now()
           )
           on conflict (inventory_number, box_number, shk) do update set
             batch_id = excluded.batch_id,
             inventory_created_at = excluded.inventory_created_at,
             row_number = excluded.row_number,
             sticker = excluded.sticker,
             barcode = excluded.barcode,
             phone = excluded.phone,
             receiver_full_name = excluded.receiver_full_name,
             article = excluded.article,
             brand = excluded.brand,
             nomenclature = excluded.nomenclature,
             size = excluded.size,
             description = excluded.description,
             kit = excluded.kit,
             price_rub = excluded.price_rub,
             tnv_ed = excluded.tnv_ed,
             mass_kg = excluded.mass_kg,
             raw_row = excluded.raw_row,
             updated_at = now()`,
          values,
        );
        updatedRows++;
      }

      if (ragQueue.length < 400) {
        ragQueue.push({
          sourceId: `${inventoryNumber}:${boxNumber}:${shk}`,
          content: [
            `Опись: ${inventoryNumber}`,
            `Коробка: ${boxNumber}`,
            `ШК: ${shk}`,
            `Артикул: ${idxArticle >= 0 ? asText(row[idxArticle]) : ""}`,
            `Бренд: ${idxBrand >= 0 ? asText(row[idxBrand]) : ""}`,
            `Номенклатура: ${idxNomenclature >= 0 ? asText(row[idxNomenclature]) : ""}`,
            `Описание: ${idxDescription >= 0 ? asText(row[idxDescription]) : ""}`,
          ].join("\n"),
          metadata: {
            block: "inbound",
            inventoryNumber,
            boxId: boxNumber,
            shk,
          },
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
        action: "wb_inbound_import",
        target_type: "wb_inbound_batch",
        target_id: batchId,
        details: { mode, totalRows, insertedRows, updatedRows, skippedRows, errorRows, uploadedBy: access.login },
      });
    }

    await rebuildWbSummary(pool);

    for (const doc of ragQueue) {
      try {
        await upsertDocument({
          sourceType: "wb_inbound",
          sourceId: doc.sourceId,
          title: `WB inbound ${doc.metadata.inventoryNumber ?? ""}`,
          content: doc.content,
          metadata: doc.metadata,
        });
      } catch {
        // best-effort
      }
    }

    return res.status(200).json({
      ok: true,
      batchId,
      mode,
      totalRows,
      insertedRows,
      updatedRows,
      skippedRows,
      errorRows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_inbound_import_failed", error);
    if (batchId) {
      try {
        await client.query("update wb_inbound_import_batches set status = 'failed' where id = $1", [batchId]);
      } catch {
        // ignore secondary error
      }
    }
    return res.status(500).json({ error: "Ошибка импорта описи WB", request_id: ctx.requestId });
  } finally {
    client.release();
  }
}

