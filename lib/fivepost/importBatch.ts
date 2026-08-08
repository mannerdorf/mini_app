import type { Pool, PoolClient } from "pg";
import { translateProductNamesEnToRu } from "../haulzReturns/openaiTranslate.js";
import { isRussianOnlyText, itogTextNeedsTranslation } from "../haulzReturns/textLanguage.js";
import { parseFivepostShipmentBuffer } from "./parseShipmentXlsx.js";
import type { FivepostRoute, FivepostShipmentRow } from "./types.js";

const TRANSLATE_BATCH = 50;

function resolveItemNameRu(itemName: string, translations: Map<string, string>): string {
  const trimmed = itemName.trim();
  if (!trimmed) return "";
  if (isRussianOnlyText(trimmed)) return trimmed;
  return translations.get(trimmed) ?? trimmed;
}

async function buildTranslationMap(texts: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique: string[] = [];
  for (const text of texts) {
    const t = text.trim();
    if (!t || map.has(t)) continue;
    if (isRussianOnlyText(t)) {
      map.set(t, t);
      continue;
    }
    if (itogTextNeedsTranslation(t)) unique.push(t);
  }

  for (let i = 0; i < unique.length; i += TRANSLATE_BATCH) {
    const batch = unique.slice(i, i + TRANSLATE_BATCH);
    const translated = await translateProductNamesEnToRu(batch);
    batch.forEach((text, idx) => {
      map.set(text, translated[idx]?.trim() || text);
    });
  }

  return map;
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
): Promise<{ batchId: number; rows: FivepostShipmentRow[]; translatedCount: number }> {
  const parsed = parseFivepostShipmentBuffer(opts.buffer, opts.filename);
  const route = opts.route ?? parsed.route;
  const shouldTranslate = opts.translate !== false;

  let translations = new Map<string, string>();
  let translatedCount = 0;
  if (shouldTranslate) {
    translations = await buildTranslationMap(parsed.rows.map((r) => r.itemName));
    translatedCount = parsed.rows.filter((r) => itogTextNeedsTranslation(r.itemName)).length;
  }

  const shipmentRows: FivepostShipmentRow[] = parsed.rows.map((row, idx) => ({
    ...row,
    lineNo: idx + 1,
    itemNameRu: shouldTranslate ? resolveItemNameRu(row.itemName, translations) : row.itemName,
  }));

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
    return { batchId, rows: shipmentRows, translatedCount };
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
