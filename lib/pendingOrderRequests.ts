import type { Pool } from "pg";
import { cityToCode } from "./cityToCode.js";
import type { FivepostRowRecord } from "./fivepost/importBatch.js";
import { directionCityCodes } from "./haulzCalculator/clientMainlineTariff.js";
import type { Direction } from "./haulzCalculator/types.js";
import { HAULZ_WAREHOUSES } from "./haulzCalculator/warehouses.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";

const WAREHOUSE_BY_CODE = Object.fromEntries(
  Object.values(HAULZ_WAREHOUSES).map((warehouse) => [warehouse.code, warehouse]),
);

type PendingOrderDbRow = {
  id: number;
  login: string;
  inn: string | null;
  punkt_otpravki: string;
  punkt_naznacheniya: string;
  nomer_zayavki: string;
  data_zabora: string | Date;
  table_rows: unknown;
  created_at: Date | string;
};

function normalizeLogin(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePendingOrderInn(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function tableRowByType(tableRows: unknown[], type: string): Record<string, unknown> | undefined {
  const row = tableRows.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === type);
  return row as Record<string, unknown> | undefined;
}

function partyDisplayName(party?: Record<string, unknown>, fallback?: Record<string, unknown>): string {
  const company = String(party?.companyName ?? "").trim();
  const name = String(party?.fullName ?? "").trim();
  if (company || name) return company || name;
  const fbCompany = String(fallback?.companyName ?? "").trim();
  const fbName = String(fallback?.fullName ?? "").trim();
  return fbCompany || fbName;
}

function resolveWarehouseFullAddress(ref: string): string {
  const warehouse = WAREHOUSE_BY_CODE[ref];
  if (!warehouse) return "";
  return warehouse.fullAddress || warehouse.label;
}

function extractPvzSide(value: unknown): { label: string; fullAddress: string; ref: string } {
  const side = value as { ref?: string; address?: { label?: string; fullAddress?: string } } | undefined;
  const label = String(side?.address?.label ?? "").trim();
  const fullAddress = String(side?.address?.fullAddress ?? label).trim();
  return {
    label: label || fullAddress,
    fullAddress,
    ref: String(side?.ref ?? "").trim(),
  };
}

function resolvePointDisplay(side: { label: string; fullAddress: string; ref: string }, punktCode: string): string {
  if (side.fullAddress) return side.fullAddress;
  if (side.label) return side.label;
  const warehouseAddress = resolveWarehouseFullAddress(side.ref || punktCode);
  if (warehouseAddress) return warehouseAddress;
  return side.ref || punktCode;
}

function resolvePendingRouteFields(
  tableRows: unknown[],
  punktFrom: string,
  punktTo: string,
): {
  CitySender: string;
  CityReceiver: string;
  ПунктОтправкиНаименование: string;
  ПунктНазначенияНаименование: string;
  АдресОтправки: string;
  АдресНазначения: string;
} {
  const pvz = tableRowByType(tableRows, "pvz");
  const quoteLines = tableRowByType(tableRows, "quote_lines");
  const fromPvz = extractPvzSide(pvz?.from);
  const toPvz = extractPvzSide(pvz?.to);
  const direction = String(quoteLines?.direction ?? "").trim();
  const fromDisplay = resolvePointDisplay(fromPvz, punktFrom);
  const toDisplay = resolvePointDisplay(toPvz, punktTo);

  if (direction === "mow_kgd" || direction === "kgd_mow") {
    const { from, to } = directionCityCodes(direction as Direction);
    return {
      CitySender: from,
      CityReceiver: to,
      ПунктОтправкиНаименование: fromDisplay,
      ПунктНазначенияНаименование: toDisplay,
      АдресОтправки: fromDisplay,
      АдресНазначения: toDisplay,
    };
  }

  const fromPoint = fromPvz.fullAddress || fromPvz.label || fromPvz.ref || punktFrom;
  const toPoint = toPvz.fullAddress || toPvz.label || toPvz.ref || punktTo;

  return {
    CitySender: cityToCode(fromPoint),
    CityReceiver: cityToCode(toPoint),
    ПунктОтправкиНаименование: fromDisplay,
    ПунктНазначенияНаименование: toDisplay,
    АдресОтправки: fromDisplay,
    АдресНазначения: toDisplay,
  };
}

export function fivepostBatchIdFromTableRows(tableRows: unknown[]): number | null {
  const block = tableRowByType(tableRows, "fivepost");
  const batchId = Number(block?.batchId ?? block?.batch_id);
  return Number.isFinite(batchId) && batchId > 0 ? batchId : null;
}

export function mapFivepostRecordToClientRow(record: FivepostRowRecord): Record<string, unknown> {
  return {
    lineNo: record.lineNo,
    clientOrderNo: record.clientOrderNo,
    partnerOrderNo: record.partnerOrderNo,
    teBarcode: record.teBarcode,
    placesCount: record.placesCount,
    omniBarcode: record.omniBarcode,
    itemName: record.itemName,
    itemNameRu: record.itemNameRu,
    unitCost: record.unitCost,
    totalCost: record.totalCost,
    weightG: record.weightG,
    lengthMm: record.lengthMm,
    widthMm: record.widthMm,
    heightMm: record.heightMm,
  };
}

async function loadFivepostRowsByBatchIds(pool: Pool, batchIds: number[]): Promise<Map<number, Record<string, unknown>[]>> {
  const out = new Map<number, Record<string, unknown>[]>();
  if (!batchIds.length) return out;

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT batch_id, line_no, client_order_no, partner_order_no, te_barcode, places_count, omni_barcode,
            item_name, item_name_ru, unit_cost, total_cost, weight_g, length_mm, width_mm, height_mm
     FROM fivepost_shipment_rows
     WHERE batch_id = ANY($1::int[])
     ORDER BY batch_id ASC, line_no ASC`,
    [batchIds],
  );

  for (const row of rows) {
    const batchId = Number(row.batch_id);
    if (!Number.isFinite(batchId) || batchId < 1) continue;
    const mapped = mapFivepostRecordToClientRow({
      id: 0,
      batchId,
      lineNo: Number(row.line_no),
      clientOrderNo: String(row.client_order_no ?? ""),
      partnerOrderNo: String(row.partner_order_no ?? ""),
      teBarcode: String(row.te_barcode ?? ""),
      placesCount: Number(row.places_count ?? 1),
      omniBarcode: String(row.omni_barcode ?? ""),
      itemName: String(row.item_name ?? ""),
      itemNameRu: String(row.item_name_ru ?? ""),
      unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      totalCost: row.total_cost == null ? null : Number(row.total_cost),
      weightG: row.weight_g == null ? null : Number(row.weight_g),
      lengthMm: row.length_mm == null ? null : Number(row.length_mm),
      widthMm: row.width_mm == null ? null : Number(row.width_mm),
      heightMm: row.height_mm == null ? null : Number(row.height_mm),
    });
    const list = out.get(batchId) ?? [];
    list.push(mapped);
    out.set(batchId, list);
  }

  return out;
}

async function attachPendingOrderCargo(
  pool: Pool,
  dbRows: PendingOrderDbRow[],
  items: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const batchIdByOrderId = new Map<number, number>();
  for (const row of dbRows) {
    const tableRows = Array.isArray(row.table_rows) ? row.table_rows : [];
    const batchId = fivepostBatchIdFromTableRows(tableRows);
    if (batchId) {
      batchIdByOrderId.set(row.id, batchId);
    }
  }

  let rowsByBatch = new Map<number, Record<string, unknown>[]>();
  try {
    rowsByBatch = await loadFivepostRowsByBatchIds(pool, [...new Set(batchIdByOrderId.values())]);
  } catch {
    rowsByBatch = new Map();
  }

  return items.map((item) => {
    const orderId = Number(item._pendingOrderId);
    const tableRows = Array.isArray(
      dbRows.find((row) => row.id === orderId)?.table_rows,
    )
      ? (dbRows.find((row) => row.id === orderId)?.table_rows as unknown[])
      : [];
    const legacyBlock = tableRowByType(tableRows, "legacy_parcels");
    const legacyRows = Array.isArray(legacyBlock?.rows) ? legacyBlock.rows : [];
    const batchId = batchIdByOrderId.get(orderId);
    const fivepostRows = batchId ? rowsByBatch.get(batchId) ?? [] : [];

    return {
      ...item,
      ...(fivepostRows.length ? { _fivepostRows: fivepostRows } : {}),
      ...(legacyRows.length ? { _legacyTableRows: legacyRows } : {}),
    };
  });
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    return new Date(value.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
  }
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return s.slice(0, 10);
}

function pendingOrderMatchesDateRange(
  row: PendingOrderDbRow,
  dateFrom: string,
  dateTo: string,
): boolean {
  const created = dateOnly(row.created_at);
  const pickup = dateOnly(row.data_zabora);
  const inRange = (d: string) => Boolean(d) && d >= dateFrom && d <= dateTo;
  return inRange(created) || inRange(pickup);
}

/** Преобразует строку pending_order_requests в формат списка «Заявки». */
export function pendingOrderToListItem(row: PendingOrderDbRow): Record<string, unknown> {
  const tableRows = Array.isArray(row.table_rows) ? row.table_rows : [];
  const source = tableRowByType(tableRows, "source");
  const contacts = tableRowByType(tableRows, "contacts");
  const fromParty = contacts?.from as Record<string, unknown> | undefined;
  const toParty = contacts?.to as Record<string, unknown> | undefined;
  const customer = contacts?.customer as Record<string, unknown> | undefined;
  const inn = normalizePendingOrderInn(row.inn ?? source?.customerInn);
  const createdDate = dateOnly(row.created_at);
  const pickupDate = dateOnly(row.data_zabora);
  const route = resolvePendingRouteFields(tableRows, row.punkt_otpravki, row.punkt_naznacheniya);

  return {
    Дата: createdDate,
    DateZayavki: createdDate,
    НомерЗаявки: row.nomer_zayavki,
    ДатаЗабораПлан: pickupDate,
    PickupDatePlan: pickupDate,
    ПунктОтправки: row.punkt_otpravki,
    ПунктНазначения: row.punkt_naznacheniya,
    ...route,
    ЗаказчикНаименование: String(source?.customerName ?? customer?.fullName ?? "").trim(),
    ЗаказчикИНН: inn,
    CustomerINN: inn,
    INN: inn,
    ОтправительНаименование:
      partyDisplayName(fromParty, customer) || String(source?.customerName ?? "").trim(),
    ПолучательНаименование: partyDisplayName(toParty),
    Комментарий: "Ожидает обработки в 1С",
    _pendingOrder: true,
    _pendingOrderId: row.id,
  };
}

/** Удаляет заявку из ЛК (pending_order_requests) по номеру — для каскада при удалении менеджером. */
export async function deletePendingOrdersByNomerZayavki(pool: Pool, nomerZayavki: string): Promise<number> {
  const number = String(nomerZayavki ?? "").trim();
  if (!number) return 0;
  try {
    const { rowCount } = await pool.query(
      `delete from pending_order_requests where nomer_zayavki = $1`,
      [number],
    );
    return rowCount ?? 0;
  } catch {
    return 0;
  }
}

export function mergeOrdersWithPending(list: unknown[], pending: Record<string, unknown>[]): unknown[] {
  const cached = Array.isArray(list) ? list : [];
  const existingNumbers = new Set(
    cached
      .map((item) =>
        String(
          (item as Record<string, unknown>)?.НомерЗаявки ??
            (item as Record<string, unknown>)?.Number ??
            (item as Record<string, unknown>)?.number ??
            "",
        ).trim(),
      )
      .filter(Boolean),
  );
  const extra = pending.filter((item) => {
    const number = String(item.НомерЗаявки ?? "").trim();
    return number && !existingNumbers.has(number);
  });
  return [...extra, ...cached];
}

async function resolvePendingInnFilter(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  inn: unknown,
  serviceMode: unknown,
): Promise<Set<string> | null> {
  const requestedInn = normalizePendingOrderInn(inn);
  const isService = !!serviceMode;
  if (isService) return null;

  let filterInns: Set<string> | null = null;
  if (!verified.accessAllInns) {
    const acRows = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [normalizeLogin(login)],
    );
    const allowed = new Set(acRows.rows.map((r) => normalizePendingOrderInn(r.inn)).filter(Boolean));
    const verifiedInn = normalizePendingOrderInn(verified.inn);
    if (verifiedInn) allowed.add(verifiedInn);
    filterInns = allowed.size > 0 ? allowed : verifiedInn ? new Set([verifiedInn]) : null;
  }

  if (filterInns === null) {
    return requestedInn ? new Set([requestedInn]) : null;
  }
  if (requestedInn) {
    return filterInns.has(requestedInn) ? new Set([requestedInn]) : new Set<string>();
  }
  return filterInns;
}

/** Данные заявки из ЛК для журнала / карточки менеджера (табличная часть из сохранённой заявки). */
export async function buildPendingOrderJournalItem(
  pool: Pool,
  nomerZayavki: string,
): Promise<Record<string, unknown> | null> {
  const number = String(nomerZayavki ?? "").trim();
  if (!number) return null;

  const { rows } = await pool.query<PendingOrderDbRow>(
    `SELECT id, login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows, created_at
     FROM pending_order_requests
     WHERE nomer_zayavki = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [number],
  );
  if (!rows[0]) return null;

  const item = pendingOrderToListItem(rows[0]);
  const [enriched] = await attachPendingOrderCargo(pool, [rows[0]], [item]);
  return enriched;
}

export async function fetchPendingOrdersForList(
  pool: Pool,
  login: string,
  dateFrom: string,
  dateTo: string,
  filterInns: Set<string> | null,
): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query<PendingOrderDbRow>(
    `SELECT id, login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows, created_at
     FROM pending_order_requests
     WHERE lower(trim(login)) = $1
       AND created_at >= ($2::date - interval '1 day')
       AND created_at < ($3::date + interval '2 day')
     ORDER BY created_at DESC`,
    [normalizeLogin(login), dateFrom, dateTo],
  );

  const filtered = rows
    .filter((row) => pendingOrderMatchesDateRange(row, dateFrom, dateTo))
    .filter((row) => {
      if (filterInns === null) return true;
      const itemInn = normalizePendingOrderInn(row.inn);
      return itemInn && filterInns.has(itemInn);
    });

  const items = filtered.map(pendingOrderToListItem);
  return attachPendingOrderCargo(pool, filtered, items);
}

/** Добавляет заявки из ЛК (pending_order_requests), пока их нет в 1С. */
export async function appendPendingOrdersForUser(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  serviceMode: unknown,
  list: unknown[],
): Promise<unknown[]> {
  try {
    const filterInns = await resolvePendingInnFilter(pool, verified, login, inn, serviceMode);
    if (filterInns && filterInns.size === 0) return list;
    const pending = await fetchPendingOrdersForList(pool, login, dateFrom, dateTo, filterInns);
    return mergeOrdersWithPending(list, pending);
  } catch {
    return list;
  }
}
