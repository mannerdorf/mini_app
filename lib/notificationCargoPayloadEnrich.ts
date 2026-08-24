import { cargoNumberLookupKeys, notificationCargoNumber } from "./notificationCargoOwnerInn.js";
import { normalizeCargoNumberForLookup } from "./documentCacheNormalized.js";
import { hasCargoLastMileMeta } from "./cargoLastMileMeta.js";
import { fetchPerevozkaRecordForPush } from "./fetchPerevozkaLastMile.js";
import { fetchInvoicesByInn, hasRealBillNumber } from "./notificationPoll.js";
import { normalizeNotificationInn } from "./notificationInnScope.js";
import { collectInvoiceLinkedCargoNumbers } from "./weeklySummaryInvoiceTable.js";
import type { CargoEvent } from "./notificationPoll.js";
import type { CargoStageEventId } from "./notificationCargoEvents.js";

type Queryable = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

const LAST_MILE_PUSH_EVENTS = new Set<CargoEvent | CargoStageEventId>([
  "delivery_scheduled",
  "delivered",
  "arrived",
]);

const BILL_PUSH_EVENTS = new Set<CargoEvent | CargoStageEventId>(["bill_created", "bill_paid"]);

const INVOICE_BILL_NUMBER_KEYS = [
  "NumberBill",
  "BillNumber",
  "BillNum",
  "Bill_Number",
  "billnum",
  "bill_number",
  "Invoice",
  "InvoiceNumber",
  "Number",
  "number",
  "Номер",
  "N",
] as const;

const INVOICE_SUM_KEYS = ["SumDoc", "SumBill", "AmountBill", "Sum", "Amount", "СуммаДокумента", "Сумма"] as const;

const INVOICE_STATE_KEYS = ["StateBill", "stateBill", "StatusBill", "Status", "State"] as const;

function isNonEmptyFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return String(value).trim() !== "";
}

/** Объединяет записи перевозки: непустые поля из overlay дополняют primary. */
export function mergeCargoItemForPushTemplate(
  primary: Record<string, unknown>,
  ...overlays: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...primary };
  for (const overlay of overlays) {
    if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) continue;
    for (const [key, value] of Object.entries(overlay)) {
      if (!isNonEmptyFieldValue(value)) continue;
      const current = merged[key];
      if (!isNonEmptyFieldValue(current)) merged[key] = value;
    }
  }
  return merged;
}

/** Пакетная загрузка payload перевозок из cache_perevozki_rows. */
export async function loadCargoPayloadsByNumbers(
  pool: Queryable,
  cargoNumbers: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const lookupKeys = new Set<string>();
  const normalizedKeys = new Set<string>();
  for (const number of cargoNumbers) {
    for (const key of cargoNumberLookupKeys(number)) lookupKeys.add(key);
    const normalized = normalizeCargoNumberForLookup(number);
    if (normalized) normalizedKeys.add(normalized);
  }
  const byNumber = new Map<string, Record<string, unknown>>();
  if (lookupKeys.size === 0) return byNumber;

  try {
    const { rows } = await pool.query<{ doc_number: string; payload: unknown }>(
      `SELECT doc_number, payload
       FROM cache_perevozki_rows
       WHERE (
         doc_number = ANY($1::text[])
         OR ltrim(regexp_replace(coalesce(doc_number, ''), '^0000-', ''), '0') = ANY($2::text[])
       )`,
      [[...lookupKeys], [...normalizedKeys]],
    );
    for (const row of rows) {
      const payload =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null;
      if (!payload) continue;
      for (const key of cargoNumberLookupKeys(String(row.doc_number || ""))) {
        byNumber.set(key, payload);
      }
    }
  } catch {
    return byNumber;
  }
  return byNumber;
}

function pickFirstField(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (!isNonEmptyFieldValue(value)) continue;
    return value;
  }
  return undefined;
}

/** Поля счёта для merge в перевозку: номер и сумма без перезаписи Number (номер груза). */
export function invoiceFieldsForPushMerge(invoice: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const billNum = pickFirstField(invoice, INVOICE_BILL_NUMBER_KEYS);
  if (billNum !== undefined) {
    out.BillNum = billNum;
    out.NumberBill = billNum;
  }
  for (const key of INVOICE_SUM_KEYS) {
    const value = invoice[key];
    if (isNonEmptyFieldValue(value)) out[key] = value;
  }
  for (const key of INVOICE_STATE_KEYS) {
    const value = invoice[key];
    if (isNonEmptyFieldValue(value)) out[key] = value;
  }
  return out;
}

function indexInvoicePayloadByCargo(
  invoice: Record<string, unknown>,
  wantedKeys: ReadonlySet<string>,
  byCargo: Map<string, Record<string, unknown>>,
): void {
  const linked = collectInvoiceLinkedCargoNumbers(invoice);
  for (const num of linked) {
    const keysForNum = cargoNumberLookupKeys(num);
    if (!keysForNum.some((key) => wantedKeys.has(key))) continue;
    for (const key of keysForNum) {
      if (!byCargo.has(key)) byCargo.set(key, invoice);
    }
  }
}

/** Пакетная загрузка счетов из cache_invoices_rows по номерам перевозок. */
export async function loadInvoicePayloadsByCargoNumbers(
  pool: Queryable,
  customerInn: string,
  cargoNumbers: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const wantedKeys = new Set<string>();
  for (const number of cargoNumbers) {
    for (const key of cargoNumberLookupKeys(number)) wantedKeys.add(key);
    const normalized = normalizeCargoNumberForLookup(number);
    if (normalized) wantedKeys.add(normalized);
  }
  const byCargo = new Map<string, Record<string, unknown>>();
  if (wantedKeys.size === 0) return byCargo;

  const innCanon = normalizeNotificationInn(customerInn);
  const innRaw = String(customerInn || "").trim();
  const inns = [...new Set([innCanon, innRaw].filter(Boolean))];

  const indexRows = (rows: Array<{ payload: unknown }>) => {
    for (const row of rows) {
      const payload =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null;
      if (payload) indexInvoicePayloadByCargo(payload, wantedKeys, byCargo);
    }
  };

  try {
    const { rows } = await pool.query<{ payload: unknown }>(
      `SELECT payload
       FROM cache_invoices_rows
       WHERE customer_inn = ANY($1::text[])
       ORDER BY doc_date DESC NULLS LAST`,
      [inns],
    );
    indexRows(rows);
  } catch {
    // cache_invoices_rows may be unavailable
  }

  if (byCargo.size === 0) {
    try {
      const { readCacheRow } = await import("./documentCacheRefreshCore.js");
      const blob = (await readCacheRow(pool as Parameters<typeof readCacheRow>[0], "cache_invoices")) as Record<
        string,
        unknown
      >[];
      for (const inv of blob) {
        if (!inv || typeof inv !== "object") continue;
        const invInn = normalizeNotificationInn(String(inv.INN ?? inv.Inn ?? inv.inn ?? ""));
        if (invInn !== innCanon && invInn !== innRaw) continue;
        indexInvoicePayloadByCargo(inv, wantedKeys, byCargo);
      }
    } catch {
      // legacy blob unavailable
    }
  }

  return byCargo;
}

export function resolveCachedInvoicePayload(
  item: Record<string, unknown>,
  invoiceByCargoNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const number = notificationCargoNumber(item);
  if (!number) return null;
  for (const key of cargoNumberLookupKeys(number)) {
    const hit = invoiceByCargoNumber.get(key);
    if (hit) return hit;
  }
  return null;
}

export function enrichBillItemForPushTemplate(
  item: Record<string, unknown>,
  invoiceByCargoNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const invoice = resolveCachedInvoicePayload(item, invoiceByCargoNumber);
  if (!invoice) return item;
  return mergeCargoItemForPushTemplate(item, invoiceFieldsForPushMerge(invoice));
}

export function resolveCachedCargoPayload(
  item: Record<string, unknown>,
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const number = notificationCargoNumber(item);
  if (!number) return null;
  for (const key of cargoNumberLookupKeys(number)) {
    const hit = payloadByNumber.get(key);
    if (hit) return hit;
  }
  return null;
}

export function enrichCargoItemForPushTemplate(
  item: Record<string, unknown>,
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const cached = resolveCachedCargoPayload(item, payloadByNumber);
  return cached ? mergeCargoItemForPushTemplate(item, cached) : item;
}

export function shouldFetchPerevozkaLastMileForPush(
  event: CargoEvent | CargoStageEventId,
  item: Record<string, unknown>,
): boolean {
  if (!LAST_MILE_PUSH_EVENTS.has(event)) return false;
  return !hasCargoLastMileMeta(item);
}

function perevozkaCacheKey(cargoNumber: string, customerInn: string): string {
  return `${cargoNumber}::${customerInn}`;
}

function invoiceLiveCacheKey(cargoNumber: string, customerInn: string): string {
  return `inv::${cargoNumber}::${customerInn}`;
}

async function fetchInvoiceForCargoFrom1c(params: {
  cargoNumber: string;
  customerInn: string;
  serviceLogin: string;
  servicePassword: string;
}): Promise<Record<string, unknown> | null> {
  const cargoNumber = String(params.cargoNumber || "").trim();
  const customerInn = String(params.customerInn || "").trim();
  const serviceLogin = String(params.serviceLogin || "").trim();
  const servicePassword = String(params.servicePassword || "").trim();
  if (!cargoNumber || !customerInn || !serviceLogin || !servicePassword) return null;

  try {
    const { items } = await fetchInvoicesByInn(customerInn, serviceLogin, servicePassword);
    const wantedKeys = new Set(cargoNumberLookupKeys(cargoNumber));
    for (const inv of items) {
      if (!inv || typeof inv !== "object") continue;
      const record = inv as Record<string, unknown>;
      const linked = collectInvoiceLinkedCargoNumbers(record);
      const matches = linked.some((num) => cargoNumberLookupKeys(num).some((key) => wantedKeys.has(key)));
      if (matches) return record;
    }
  } catch {
    return null;
  }
  return null;
}

/** Готовит запись перевозки для push-шаблона: cache → merge → при необходимости GetPerevozka. */
export async function resolveCargoItemForPushTemplate(params: {
  item: Record<string, unknown>;
  event: CargoEvent | CargoStageEventId;
  payloadByNumber: ReadonlyMap<string, Record<string, unknown>>;
  invoiceByCargoNumber?: ReadonlyMap<string, Record<string, unknown>>;
  customerInn?: string;
  serviceLogin?: string;
  servicePassword?: string;
  perevozkaCache?: Map<string, Record<string, unknown> | null>;
  invoiceLiveCache?: Map<string, Record<string, unknown> | null>;
}): Promise<Record<string, unknown>> {
  let merged = enrichCargoItemForPushTemplate(params.item, params.payloadByNumber);
  if (BILL_PUSH_EVENTS.has(params.event)) {
    if (params.invoiceByCargoNumber && params.invoiceByCargoNumber.size > 0) {
      merged = enrichBillItemForPushTemplate(merged, params.invoiceByCargoNumber);
    }
    if (!hasRealBillNumber(merged)) {
      const cargoNumber = notificationCargoNumber(merged);
      const customerInn = String(params.customerInn || "").trim();
      const login = String(params.serviceLogin || "").trim();
      const password = String(params.servicePassword || "").trim();
      if (cargoNumber && customerInn && login && password) {
        const liveKey = invoiceLiveCacheKey(cargoNumber, customerInn);
        const liveCache = params.invoiceLiveCache;
        let liveInvoice: Record<string, unknown> | null = null;
        if (liveCache?.has(liveKey)) {
          liveInvoice = liveCache.get(liveKey) ?? null;
        } else {
          liveInvoice = await fetchInvoiceForCargoFrom1c({
            cargoNumber,
            customerInn,
            serviceLogin: login,
            servicePassword: password,
          });
          liveCache?.set(liveKey, liveInvoice);
        }
        if (liveInvoice) {
          merged = mergeCargoItemForPushTemplate(merged, invoiceFieldsForPushMerge(liveInvoice));
        }
      }
    }
  }
  if (!shouldFetchPerevozkaLastMileForPush(params.event, merged)) return merged;

  const cargoNumber = notificationCargoNumber(merged);
  const customerInn = String(params.customerInn || "").trim();
  const login = String(params.serviceLogin || "").trim();
  const password = String(params.servicePassword || "").trim();
  if (!cargoNumber || !login || !password) return merged;

  const cacheKey = perevozkaCacheKey(cargoNumber, customerInn);
  const cache = params.perevozkaCache;
  if (cache?.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (cached) merged = mergeCargoItemForPushTemplate(merged, cached);
    return merged;
  }

  const detail = await fetchPerevozkaRecordForPush({
    cargoNumber,
    customerInn,
    serviceLogin: login,
    servicePassword: password,
  });
  if (cache) cache.set(cacheKey, detail);
  if (detail) merged = mergeCargoItemForPushTemplate(merged, detail);
  return merged;
}
