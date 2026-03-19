import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as XLSX from "xlsx";
import { getPool } from "../../_db.js";
import { parseMultipart } from "../../_pnl-multipart.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { parseDateOnly, parseNum, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";
import { upsertDocument } from "../../../lib/rag.js";

export const config = { api: { bodyParser: false } };
const MAX_INBOUND_FILES = 15;

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
    const hasShk = normalized.some((c) => c === "шк" || c.startsWith("шк") || c.includes(" шк"));
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
    const inboundFiles = files.filter((f) => f.fieldName === "file" || f.fieldName === "files");
    if (inboundFiles.length === 0) return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    if (inboundFiles.length > MAX_INBOUND_FILES) {
      return res.status(400).json({ error: `Можно загрузить максимум ${MAX_INBOUND_FILES} файлов за раз`, request_id: ctx.requestId });
    }
    const mode = String(fields.mode || "append").trim().toLowerCase() === "upsert" ? "upsert" : "append";

    const batchResult = await client.query<{ id: number }>(
      `insert into wb_inbound_import_batches (block_type, mode, source_filename, uploaded_by_login, status)
       values ('inbound', $1, $2, $3, 'completed')
       returning id`,
      [
        mode,
        inboundFiles.length === 1
          ? (inboundFiles[0]?.originalFilename || "upload.xlsx")
          : `${inboundFiles.length} files`,
        access.login,
      ],
    );
    batchId = batchResult.rows[0]?.id ?? null;

    let totalRows = 0;
    let insertedRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const ragQueue: Array<{ sourceId: string; content: string; metadata: Record<string, unknown> }> = [];
    for (const file of inboundFiles) {
      let wb: XLSX.WorkBook | null = null;
      try {
        wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      } catch (fileReadError) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4)`,
            [batchId, null, `Не удалось прочитать файл: ${(fileReadError as Error)?.message || "unknown_error"}`, JSON.stringify({ file: file.originalFilename })],
          );
        }
        continue;
      }
      const sheetNames = wb.SheetNames || [];
      if (sheetNames.length === 0) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4)`,
            [batchId, null, "В файле нет доступных листов", JSON.stringify({ file: file.originalFilename })],
          );
        }
        continue;
      }

      let fileMatchedAnySheet = false;
      for (const sheetName of sheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
        if (!data.length) continue;

        const headerRowIdx = findHeaderRow(data);
        if (headerRowIdx < 0) continue;
        const { inventoryNumber: invMeta, inventoryDate } = parseInventoryMeta(data);
        const header = data[headerRowIdx] ?? [];
        const headerMap = new Map<string, number>();
        header.forEach((cell, idx) => headerMap.set(normalizeHeaderCell(cell), idx));
        const col = (name: string) => headerMap.get(name) ?? -1;

        const idxBox = col("номер коробки");
        const idxShk = col("шк");
        if (idxBox < 0 || idxShk < 0) continue;

        fileMatchedAnySheet = true;
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
                [batchId, i + 1, "Пустой ключ (опись/коробка/ШК)", JSON.stringify({ row, file: file.originalFilename, sheet: sheetName })],
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
            JSON.stringify({ row, file: file.originalFilename, sheet: sheetName }),
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

          if (ragQueue.length < 1200) {
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
                sheet: sheetName,
              },
            });
          }
        }
      }

      if (!fileMatchedAnySheet) {
        errorRows++;
        if (batchId) {
          await client.query(
            `insert into wb_import_row_errors (batch_id, row_number, error_message, row_payload)
             values ($1, $2, $3, $4)`,
            [
              batchId,
              null,
              "Не найдено ни одного листа с колонками 'Номер коробки' и 'ШК'",
              JSON.stringify({ file: file.originalFilename, sheets: sheetNames }),
            ],
          );
        }
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
        details: { mode, files: inboundFiles.length, totalRows, insertedRows, updatedRows, skippedRows, errorRows, uploadedBy: access.login },
      });
    }

    if (totalRows === 0 && insertedRows === 0 && updatedRows === 0) {
      return res.status(400).json({
        error: "Не удалось распознать данные в файлах. Проверьте, что в книге есть лист с колонками 'Номер коробки' и 'ШК'.",
        batchId,
        files: inboundFiles.length,
        errorRows,
        request_id: ctx.requestId,
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
      files: inboundFiles.length,
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
    const message = (error as Error)?.message || "Ошибка импорта описи WB";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  } finally {
    client.release();
  }
}

