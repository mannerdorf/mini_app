import type { Pool, PoolClient } from "pg";
import { translateProductNamesToRu } from "./productNameTranslate.js";
import {
  isRussianOnlyText,
  itogTextNeedsTranslation,
  translationLooksSuccessful,
} from "../haulzReturns/textLanguage.js";
import {
  applyProductNameTranslation,
  collectUniqueProductNameTranslationKeys,
} from "./productNameTranslation.js";
import { parseFivepostShipmentBuffer } from "./parseShipmentXlsx.js";
import type { FivepostRoute, FivepostParsedRow, FivepostShipmentRow } from "./types.js";

const TRANSLATE_BATCH = 50;
const TRANSLATE_CONCURRENCY = 5;

async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      await tasks[idx]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

function resolveItemNameRu(itemName: string, translations: Map<string, string>): string {
  return applyProductNameTranslation(itemName, translations);
}

export function countFivepostRowsSuccessfullyTranslated(rows: Pick<FivepostShipmentRow, "itemName" | "itemNameRu">[]): number {
  return rows.filter(
    (row) => itogTextNeedsTranslation(row.itemName) && translationLooksSuccessful(row.itemName, row.itemNameRu),
  ).length;
}

export function countFivepostRowsStillNeedingTranslation(rows: Pick<FivepostShipmentRow, "itemName" | "itemNameRu">[]): number {
  return rows.filter(
    (row) => itogTextNeedsTranslation(row.itemName) && !translationLooksSuccessful(row.itemName, row.itemNameRu),
  ).length;
}

export function countFivepostRowsNeedingTranslation(itemNames: string[]): number {
  return itemNames.filter((name) => itogTextNeedsTranslation(name)).length;
}

async function buildTranslationMap(texts: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const text of texts) {
    const t = text.trim();
    if (!t || map.has(t)) continue;
    if (isRussianOnlyText(t)) {
      map.set(t, t);
    }
  }

  const uniqueKeys = collectUniqueProductNameTranslationKeys(texts);
  const batchRanges: string[][] = [];
  for (let i = 0; i < uniqueKeys.length; i += TRANSLATE_BATCH) {
    batchRanges.push(uniqueKeys.slice(i, i + TRANSLATE_BATCH));
  }

  await runWithConcurrency(
    batchRanges.map((batch) => async () => {
      const translated = await translateProductNamesToRu(batch);
      batch.forEach((text, idx) => {
        map.set(text, translated[idx]?.trim() || text);
      });
    }),
    TRANSLATE_CONCURRENCY,
  );

  return map;
}

function dbRowToShipmentRow(r: Record<string, unknown>): FivepostShipmentRow {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    lineNo: Number(r.line_no),
    clientOrderNo: String(r.client_order_no ?? ""),
    partnerOrderNo: String(r.partner_order_no ?? ""),
    teBarcode: String(r.te_barcode ?? ""),
    placesCount: Number(r.places_count ?? 1),
    omniBarcode: String(r.omni_barcode ?? ""),
    itemName: String(r.item_name ?? ""),
    itemNameRu: String(r.item_name_ru ?? ""),
    unitCost: num(r.unit_cost),
    totalCost: num(r.total_cost),
    weightG: num(r.weight_g),
    lengthMm: num(r.length_mm),
    widthMm: num(r.width_mm),
    heightMm: num(r.height_mm),
  };
}

export async function saveFivepostParsedRows(
  pool: Pool,
  opts: {
    login: string;
    filename: string;
    route?: FivepostRoute;
    rows: FivepostParsedRow[];
  },
): Promise<{
  batchId: number;
  rows: FivepostShipmentRow[];
  translatedCount: number;
  needsTranslationCount: number;
}> {
  const route = opts.route ?? "kgd_mow";
  const needsTranslationCount = countFivepostRowsNeedingTranslation(opts.rows.map((r) => r.itemName));
  const shipmentRows: FivepostShipmentRow[] = opts.rows.map((row, idx) => ({
    ...row,
    lineNo: idx + 1,
    itemNameRu: row.itemName,
  }));

  const client = await pool.connect();
  try {
    await client.query("begin");
    const batchRes = await client.query<{ id: number }>(
      `insert into fivepost_import_batches (login, filename, route, status, row_count, translated_count)
       values ($1, $2, $3, 'completed', $4, 0)
       returning id`,
      [opts.login, opts.filename, route, shipmentRows.length],
    );
    const batchId = batchRes.rows[0]?.id;
    if (!batchId) throw new Error("Не удалось создать пакет импорта");

    await insertShipmentRows(client, batchId, shipmentRows);
    await client.query("commit");
    return { batchId, rows: shipmentRows, translatedCount: 0, needsTranslationCount };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function importFivepostShipmentXlsx(
  pool: Pool,
  opts: {
    buffer: Buffer;
    filename: string;
    login: string;
    route?: FivepostRoute;
    translate?: boolean;
  },
): Promise<{
  batchId: number;
  rows: FivepostShipmentRow[];
  translatedCount: number;
  needsTranslationCount: number;
}> {
  const parsed = parseFivepostShipmentBuffer(opts.buffer, opts.filename);
  const route = opts.route ?? parsed.route;
  const shouldTranslate = opts.translate === true;
  const needsTranslationCount = countFivepostRowsNeedingTranslation(parsed.rows.map((r) => r.itemName));

  if (!shouldTranslate) {
    return saveFivepostParsedRows(pool, {
      login: opts.login,
      filename: opts.filename,
      route,
      rows: parsed.rows,
    });
  }

  const translations = await buildTranslationMap(parsed.rows.map((r) => r.itemName));

  const shipmentRows: FivepostShipmentRow[] = parsed.rows.map((row, idx) => ({
    ...row,
    lineNo: idx + 1,
    itemNameRu: resolveItemNameRu(row.itemName, translations),
  }));
  const translatedCount = countFivepostRowsSuccessfullyTranslated(shipmentRows);
  const remainingNeedsTranslation = countFivepostRowsStillNeedingTranslation(shipmentRows);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const batchRes = await client.query<{ id: number }>(
      `insert into fivepost_import_batches (login, filename, route, status, row_count, translated_count)
       values ($1, $2, $3, 'completed', $4, $5)
       returning id`,
      [opts.login, opts.filename, route, shipmentRows.length, translatedCount],
    );
    const batchId = batchRes.rows[0]?.id;
    if (!batchId) throw new Error("Не удалось создать пакет импорта");

    await insertShipmentRows(client, batchId, shipmentRows);
    await client.query("commit");
    return {
      batchId,
      rows: shipmentRows,
      translatedCount,
      needsTranslationCount: remainingNeedsTranslation,
    };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function translateFivepostBatch(
  pool: Pool,
  batchId: number,
): Promise<{ rows: FivepostShipmentRow[]; translatedCount: number; needsTranslationCount: number }> {
  const client = await pool.connect();
  try {
    const { rows: dbRows } = await client.query<Record<string, unknown>>(
      `select * from fivepost_shipment_rows where batch_id = $1 order by line_no asc`,
      [batchId],
    );
    if (!dbRows.length) throw new Error("Пакет не найден или пустой");

    const shipmentRows = dbRows.map((r) => dbRowToShipmentRow(r));
    const needsTranslationCount = countFivepostRowsNeedingTranslation(shipmentRows.map((r) => r.itemName));
    if (needsTranslationCount === 0) {
      return { rows: shipmentRows, translatedCount: 0, needsTranslationCount: 0 };
    }

    const translations = await buildTranslationMap(shipmentRows.map((r) => r.itemName));
    const updatedRows = shipmentRows.map((row) => ({
      ...row,
      itemNameRu: resolveItemNameRu(row.itemName, translations),
    }));
    const translatedCount = countFivepostRowsSuccessfullyTranslated(updatedRows);
    const remainingNeedsTranslation = countFivepostRowsStillNeedingTranslation(updatedRows);

    await client.query("begin");
    for (const row of updatedRows) {
      if (!itogTextNeedsTranslation(row.itemName)) continue;
      await client.query(
        `update fivepost_shipment_rows set item_name_ru = $1 where batch_id = $2 and line_no = $3`,
        [row.itemNameRu, batchId, row.lineNo],
      );
    }
    await client.query(
      `update fivepost_import_batches set translated_count = $1 where id = $2`,
      [translatedCount, batchId],
    );
    await client.query("commit");

    return { rows: updatedRows, translatedCount, needsTranslationCount: remainingNeedsTranslation };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

async function insertShipmentRows(client: PoolClient, batchId: number, rows: FivepostShipmentRow[]) {
  const chunkSize = 100;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((row, i) => {
      const base = i * 15;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`,
      );
      values.push(
        batchId,
        row.lineNo,
        row.clientOrderNo,
        row.partnerOrderNo,
        row.teBarcode,
        row.placesCount,
        row.omniBarcode,
        row.itemName,
        row.itemNameRu,
        row.unitCost,
        row.totalCost,
        row.weightG,
        row.lengthMm,
        row.widthMm,
        row.heightMm,
      );
    });

    await client.query(
      `insert into fivepost_shipment_rows (
         batch_id, line_no, client_order_no, partner_order_no, te_barcode, places_count, omni_barcode,
         item_name, item_name_ru, unit_cost, total_cost, weight_g, length_mm, width_mm, height_mm
       ) values ${placeholders.join(", ")}`,
      values,
    );
  }
}

export type FivepostRowRecord = {
  id: number;
  batchId: number;
  lineNo: number;
  clientOrderNo: string;
  partnerOrderNo: string;
  teBarcode: string;
  placesCount: number;
  omniBarcode: string;
  itemName: string;
  itemNameRu: string;
  unitCost: number | null;
  totalCost: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
};

function mapRowRecord(r: Record<string, unknown>): FivepostRowRecord {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: Number(r.id),
    batchId: Number(r.batch_id),
    lineNo: Number(r.line_no),
    clientOrderNo: String(r.client_order_no ?? ""),
    partnerOrderNo: String(r.partner_order_no ?? ""),
    teBarcode: String(r.te_barcode ?? ""),
    placesCount: Number(r.places_count ?? 1),
    omniBarcode: String(r.omni_barcode ?? ""),
    itemName: String(r.item_name ?? ""),
    itemNameRu: String(r.item_name_ru ?? ""),
    unitCost: num(r.unit_cost),
    totalCost: num(r.total_cost),
    weightG: num(r.weight_g),
    lengthMm: num(r.length_mm),
    widthMm: num(r.width_mm),
    heightMm: num(r.height_mm),
  };
}

export async function listFivepostBatches(pool: Pool, limit = 20) {
  const { rows } = await pool.query(
    `select id, login, filename, route, status, row_count, translated_count, created_at
     from fivepost_import_batches
     order by created_at desc
     limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    login: String(r.login ?? ""),
    filename: String(r.filename ?? ""),
    route: String(r.route ?? "") as FivepostRoute,
    status: String(r.status ?? ""),
    rowCount: Number(r.row_count ?? 0),
    translatedCount: Number(r.translated_count ?? 0),
    createdAt: String(r.created_at ?? ""),
  }));
}

export async function listFivepostRows(pool: Pool, batchId: number, limit = 5000): Promise<FivepostRowRecord[]> {
  const { rows } = await pool.query(
    `select *
     from fivepost_shipment_rows
     where batch_id = $1
     order by line_no asc
     limit $2`,
    [batchId, limit],
  );
  return rows.map((r) => mapRowRecord(r as Record<string, unknown>));
}
