import type { Pool } from "pg";
import type { ZayavkaUploadPayload } from "./post1cZayavkaUpload.js";
import { allocateZayavkaSendingIds, normalizeCustomerInnForSendingId } from "./zayavkaSendingIdAllocator.js";

function tableRowByType(tableRows: unknown[], type: string): Record<string, unknown> | undefined {
  const row = tableRows.find(
    (item) => item && typeof item === "object" && (item as Record<string, unknown>).type === type,
  );
  return row as Record<string, unknown> | undefined;
}

function countMissingSendingIds(payload: ZayavkaUploadPayload): number {
  let n = 0;
  for (const parcel of payload.Посылки) {
    for (const good of parcel.Товары ?? []) {
      if (!String(good.ИДОтправления ?? "").trim()) n += 1;
    }
  }
  return n;
}

function applySendingIds(payload: ZayavkaUploadPayload, ids: string[]): ZayavkaUploadPayload {
  let idx = 0;
  const parcels = payload.Посылки.map((parcel) => ({
    ...parcel,
    Товары: (parcel.Товары ?? []).map((good) => {
      if (String(good.ИДОтправления ?? "").trim()) return good;
      const id = ids[idx];
      idx += 1;
      return id ? { ...good, ИДОтправления: id } : good;
    }),
  }));
  return { ...payload, Посылки: parcels };
}

/** Подставляет ПолучательИНН из contacts, если в payload пусто. */
export function patchReceiverInnFromPendingTableRows(
  payload: ZayavkaUploadPayload,
  tableRows: unknown[],
): ZayavkaUploadPayload {
  if (normalizeCustomerInnForSendingId(payload.ПолучательИНН)) return payload;
  const contacts = tableRowByType(tableRows, "contacts");
  const toParty = contacts?.to as Record<string, unknown> | undefined;
  const receiverInn = normalizeCustomerInnForSendingId(toParty?.inn);
  if (!receiverInn) return payload;
  return { ...payload, ПолучательИНН: receiverInn };
}

/** Перед отправкой в 1С: ИДОтправления + ПолучательИНН из сохранённой заявки. */
export async function finalizeZayavkaPayloadFor1c(
  pool: Pool,
  payload: ZayavkaUploadPayload,
  opts?: { nomerZayavki?: string | null; tableRows?: unknown[] },
): Promise<ZayavkaUploadPayload> {
  let next = payload;
  if (opts?.tableRows?.length) {
    next = patchReceiverInnFromPendingTableRows(next, opts.tableRows);
  }

  const missing = countMissingSendingIds(next);
  if (missing <= 0) return next;

  const ids = await allocateZayavkaSendingIds(pool, next.ЗаказчикИНН, missing, {
    nomerZayavki: opts?.nomerZayavki,
  });
  return applySendingIds(next, ids);
}
