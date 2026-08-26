import type { Pool } from "pg";
import { buildDocumentsOrderZayavkaPayload } from "./documentsOrderZayavkaPayload.js";
import {
  fivepostBatchIdFromTableRows,
  loadFivepostRowsByBatchIds,
  normalizePendingOrderInn,
  type PendingOrderDbRow,
} from "./pendingOrderRequests.js";
import {
  normalizeZayavkaUploadPayload,
  type ZayavkaUploadPayload,
} from "./post1cZayavkaUpload.js";
import { finalizeZayavkaPayloadFor1c } from "./finalizeZayavkaPayloadFor1c.js";

export const PENDING_ORDER_ZAYAVKA_ROW_TYPE = "zayavka_1c";

function tableRowByType(tableRows: unknown[], type: string): Record<string, unknown> | undefined {
  const row = tableRows.find(
    (item) => item && typeof item === "object" && (item as Record<string, unknown>).type === type,
  );
  return row as Record<string, unknown> | undefined;
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function extractStoredZayavkaPayload(tableRows: unknown[]): ZayavkaUploadPayload | null {
  const row = tableRowByType(Array.isArray(tableRows) ? tableRows : [], PENDING_ORDER_ZAYAVKA_ROW_TYPE);
  const payload = row?.payload ?? row?.order;
  const normalized = normalizeZayavkaUploadPayload(payload);
  return normalized.ok ? normalized.payload : null;
}

/** JSON заявки для 1С из pending_order_requests (сохранённый payload или сборка из table_rows). */
export async function resolveZayavkaPayloadForPendingOrder(
  pool: Pool,
  row: PendingOrderDbRow,
): Promise<ZayavkaUploadPayload | null> {
  const tableRows = Array.isArray(row.table_rows) ? row.table_rows : [];
  const stored = extractStoredZayavkaPayload(tableRows);
  if (stored) {
    return finalizeZayavkaPayloadFor1c(pool, stored, {
      nomerZayavki: row.nomer_zayavki,
      tableRows,
    });
  }

  const source = tableRowByType(tableRows, "source");
  const contacts = tableRowByType(tableRows, "contacts");
  const cargo = tableRowByType(tableRows, "cargo");
  const fromParty = (contacts?.from ?? {}) as Record<string, unknown>;
  const toParty = (contacts?.to ?? {}) as Record<string, unknown>;
  const places = Array.isArray(cargo?.places) ? cargo.places : [];

  const batchId = fivepostBatchIdFromTableRows(tableRows);
  let fivepostRows: Parameters<typeof buildDocumentsOrderZayavkaPayload>[0]["fivepostRows"];
  if (batchId) {
    const byBatch = await loadFivepostRowsByBatchIds(pool, [batchId]);
    fivepostRows = (byBatch.get(batchId) ?? []).map((r) => ({
      omniBarcode: String(r.omniBarcode ?? ""),
      teBarcode: String(r.teBarcode ?? ""),
      clientOrderNo: String(r.clientOrderNo ?? ""),
      partnerOrderNo: String(r.partnerOrderNo ?? ""),
      itemNameRu: String(r.itemNameRu ?? ""),
      itemName: String(r.itemName ?? ""),
      unitCost: typeof r.unitCost === "number" ? r.unitCost : Number(r.unitCost) || 0,
      totalCost: typeof r.totalCost === "number" ? r.totalCost : Number(r.totalCost) || 0,
      placesCount: typeof r.placesCount === "number" ? r.placesCount : Number(r.placesCount) || 1,
    }));
  }

  const legacyBlock = tableRowByType(tableRows, "legacy_parcels");
  const legacyRaw = Array.isArray(legacyBlock?.rows) ? legacyBlock.rows : [];
  const tableRowsInput = legacyRaw.length
    ? legacyRaw.map((r) => {
        const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
        return {
          posylka: String(o.posylka ?? o.Posylka ?? ""),
          perevozka: String(o.perevozka ?? o.Perevozka ?? ""),
          idOtpravleniya: String(o.idOtpravleniya ?? o.id_otpravleniya ?? "").trim() || undefined,
        };
      })
    : undefined;

  const payload = buildDocumentsOrderZayavkaPayload({
    customerInn: normalizePendingOrderInn(row.inn ?? source?.customerInn),
    senderInn: String(fromParty.inn ?? ""),
    receiverInn: String(toParty.inn ?? ""),
    punktOtpravki: row.punkt_otpravki,
    punktNaznacheniya: row.punkt_naznacheniya,
    dataZabora: dateOnly(row.data_zabora),
    nomerZayavkiKlienta: String(source?.customerRequestNumber ?? "").trim() || undefined,
    declaredValueRub: Number(cargo?.declaredValueRub ?? 0) || 0,
    placeCount: places.length || 1,
    fivepostRows,
    tableRows: tableRowsInput,
  });

  const normalized = normalizeZayavkaUploadPayload(payload);
  if (!normalized.ok) return null;
  return finalizeZayavkaPayloadFor1c(pool, normalized.payload, {
    nomerZayavki: row.nomer_zayavki,
    tableRows,
  });
}
