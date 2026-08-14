import type { Pool, PoolClient } from "pg";
import { cityToCode } from "./cityToCode.js";
import type { FivepostRowRecord } from "./fivepost/importBatch.js";
import { directionCityCodes } from "./haulzCalculator/clientMainlineTariff.js";
import {
  HAULZ_CALC_DRAFT_STATUS_LABELS,
  parseHaulzCalcDraftStatus,
  type HaulzCalcDraftStatus,
} from "./haulzCalculator/draftStatus.js";
import type { Direction } from "./haulzCalculator/types.js";
import { HAULZ_WAREHOUSES } from "./haulzCalculator/warehouses.js";
import {
  normalizeCompanyName,
  normalizeOrderInn,
  orderMatchesCustomerScope,
} from "./orderCustomerScope.js";
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
  return normalizeOrderInn(value);
}

export const PENDING_ORDER_MANAGER_STATUS_ROW_TYPE = "manager_status";

function tableRowByType(tableRows: unknown[], type: string): Record<string, unknown> | undefined {
  const row = tableRows.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === type);
  return row as Record<string, unknown> | undefined;
}

export function upsertManagerStatusInTableRows(
  tableRows: unknown[],
  status: HaulzCalcDraftStatus,
  label?: string,
): unknown[] {
  const rows = Array.isArray(tableRows) ? tableRows : [];
  const statusLabel = label ?? HAULZ_CALC_DRAFT_STATUS_LABELS[status] ?? status;
  const withoutManagerStatus = rows.filter(
    (item) =>
      !(
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === PENDING_ORDER_MANAGER_STATUS_ROW_TYPE
      ),
  );
  return [
    ...withoutManagerStatus,
    { type: PENDING_ORDER_MANAGER_STATUS_ROW_TYPE, status, label: statusLabel },
  ];
}

export function resolvePendingOrderStatusLabel(tableRows: unknown[]): string {
  const managerStatus = tableRowByType(
    Array.isArray(tableRows) ? tableRows : [],
    PENDING_ORDER_MANAGER_STATUS_ROW_TYPE,
  );
  const label = String(managerStatus?.label ?? "").trim();
  if (label) return label;
  const status = parseHaulzCalcDraftStatus(managerStatus?.status);
  if (status !== "draft") return HAULZ_CALC_DRAFT_STATUS_LABELS[status];
  return "Ожидает обработки";
}

/** Синхронизирует статус менеджера в pending_order_requests для отображения в ЛК заказчика. */
export async function syncPendingOrderManagerStatus(
  pool: Pool,
  nomerZayavki: string,
  status: HaulzCalcDraftStatus,
): Promise<number> {
  const number = String(nomerZayavki ?? "").trim();
  if (!number || status === "draft") return 0;

  const { rows } = await pool.query<{ id: number; table_rows: unknown }>(
    `SELECT id, table_rows FROM pending_order_requests WHERE nomer_zayavki = $1`,
    [number],
  );
  if (!rows.length) return 0;

  let updated = 0;
  for (const row of rows) {
    const tableRows = upsertManagerStatusInTableRows(
      Array.isArray(row.table_rows) ? row.table_rows : [],
      status,
    );
    await pool.query(`UPDATE pending_order_requests SET table_rows = $2::jsonb WHERE id = $1`, [
      row.id,
      JSON.stringify(tableRows),
    ]);
    updated += 1;
  }
  return updated;
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

async function loadDraftStatusLabelsByNomer(pool: Pool, nomers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(nomers.map((n) => String(n ?? "").trim()).filter(Boolean))];
  if (!unique.length) return out;

  try {
    const { rows } = await pool.query<{ nomer_zayavki: string; status: string }>(
      `SELECT nomer_zayavki, status
       FROM haulz_calc_drafts
       WHERE nomer_zayavki = ANY($1::text[]) AND status <> 'draft'`,
      [unique],
    );
    for (const row of rows) {
      const nomer = String(row.nomer_zayavki ?? "").trim();
      const status = parseHaulzCalcDraftStatus(row.status);
      if (nomer) out.set(nomer, HAULZ_CALC_DRAFT_STATUS_LABELS[status]);
    }
  } catch {
    // haulz_calc_drafts may be absent in some environments
  }

  return out;
}

async function attachPendingOrderCargo(
  pool: Pool,
  dbRows: PendingOrderDbRow[],
  items: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const batchIdByOrderId = new Map<number, number>();
  const dbRowById = new Map<number, PendingOrderDbRow>();
  for (const row of dbRows) {
    dbRowById.set(row.id, row);
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

  const nomersNeedingDraftStatus = dbRows
    .filter((row) => !tableRowByType(Array.isArray(row.table_rows) ? row.table_rows : [], PENDING_ORDER_MANAGER_STATUS_ROW_TYPE))
    .map((row) => row.nomer_zayavki);
  const draftStatusByNomer = await loadDraftStatusLabelsByNomer(pool, nomersNeedingDraftStatus);

  return items.map((item) => {
    const orderId = Number(item._pendingOrderId);
    const dbRow = dbRowById.get(orderId);
    const tableRows = Array.isArray(dbRow?.table_rows) ? (dbRow.table_rows as unknown[]) : [];
    const legacyBlock = tableRowByType(tableRows, "legacy_parcels");
    const legacyRows = Array.isArray(legacyBlock?.rows) ? legacyBlock.rows : [];
    const batchId = batchIdByOrderId.get(orderId);
    const fivepostRows = batchId ? rowsByBatch.get(batchId) ?? [] : [];

    let statusLabel = resolvePendingOrderStatusLabel(tableRows);
    if (statusLabel === "Ожидает обработки") {
      const nomer = String(item.НомерЗаявки ?? dbRow?.nomer_zayavki ?? "").trim();
      const draftLabel = nomer ? draftStatusByNomer.get(nomer) : undefined;
      if (draftLabel) statusLabel = draftLabel;
    }

    return {
      ...item,
      Статус: statusLabel,
      State: statusLabel,
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

  const customerRequestNumber = String(source?.customerRequestNumber ?? "").trim();
  const statusLabel = resolvePendingOrderStatusLabel(tableRows);

  return {
    Дата: createdDate,
    DateZayavki: createdDate,
    НомерЗаявки: row.nomer_zayavki,
    НомерЗаявкиКлиента: customerRequestNumber,
    ClientRequestNumber: customerRequestNumber,
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
    Статус: statusLabel,
    State: statusLabel,
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
  scopeName?: string,
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

  const normalizedScopeName = normalizeCompanyName(scopeName);
  const filtered = rows
    .filter((row) => pendingOrderMatchesDateRange(row, dateFrom, dateTo))
    .filter((row) => {
      if (filterInns === null && !normalizedScopeName) return true;
      const item = pendingOrderToListItem(row);
      if (normalizedScopeName) {
        const scopeInn = filterInns?.size === 1 ? [...filterInns][0] : undefined;
        return orderMatchesCustomerScope(item, { inn: scopeInn, name: normalizedScopeName });
      }
      const itemInn = normalizePendingOrderInn(row.inn);
      return itemInn && filterInns!.has(itemInn);
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
  customerName?: unknown,
): Promise<unknown[]> {
  try {
    if (serviceMode) return list;
    const filterInns = await resolvePendingInnFilter(pool, verified, login, inn, serviceMode);
    const scopeName = normalizeCompanyName(customerName);
    if (filterInns && filterInns.size === 0 && !scopeName) return list;
    const pending = await fetchPendingOrdersForList(
      pool,
      login,
      dateFrom,
      dateTo,
      scopeName ? null : filterInns,
      scopeName || undefined,
    );
    return mergeOrdersWithPending(list, pending);
  } catch {
    return list;
  }
}

async function deleteLinkedCalcDrafts(client: PoolClient, nomerZayavki: string): Promise<void> {
  const number = String(nomerZayavki ?? "").trim();
  if (!number) return;
  await client.query(`DELETE FROM haulz_calc_drafts WHERE nomer_zayavki = $1 AND status <> 'draft'`, [number]);
}

/** Удаляет заявку из ЛК и связанный черновик менеджера по номеру. */
export async function deletePendingOrderByNomerForUser(
  pool: Pool,
  login: string,
  nomerZayavki: string,
): Promise<boolean> {
  const number = String(nomerZayavki ?? "").trim();
  const normalizedLogin = normalizeLogin(login);
  if (!number || !normalizedLogin) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      `SELECT id FROM pending_order_requests
       WHERE nomer_zayavki = $1 AND lower(trim(login)) = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [number, normalizedLogin],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }

    const { rowCount } = await client.query(
      `DELETE FROM pending_order_requests WHERE id = $1 AND lower(trim(login)) = $2`,
      [rows[0].id, normalizedLogin],
    );
    if ((rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    await deleteLinkedCalcDrafts(client, number);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deletePendingOrderForUser(
  pool: Pool,
  login: string,
  pendingOrderId: number,
): Promise<boolean> {
  if (!Number.isFinite(pendingOrderId) || pendingOrderId < 1) return false;
  const normalizedLogin = normalizeLogin(login);
  if (!normalizedLogin) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ nomer_zayavki: string }>(
      `SELECT nomer_zayavki FROM pending_order_requests
       WHERE id = $1 AND lower(trim(login)) = $2`,
      [pendingOrderId, normalizedLogin],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }

    const { rowCount } = await client.query(
      `DELETE FROM pending_order_requests WHERE id = $1 AND lower(trim(login)) = $2`,
      [pendingOrderId, normalizedLogin],
    );
    if ((rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    await deleteLinkedCalcDrafts(client, rows[0].nomer_zayavki);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
