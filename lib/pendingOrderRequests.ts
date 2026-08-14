import type { Pool } from "pg";
import { cityToCode } from "./cityToCode.js";
import {
  getOrderCustomerInn,
  getOrderSenderName,
  normalizeCompanyName,
  normalizeOrderInn,
  orderMatchesCustomerScope,
} from "./orderCustomerScope.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";

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

function resolvePendingRouteFields(tableRows: unknown[], punktFrom: string, punktTo: string) {
  const pvz = tableRowByType(tableRows, "pvz");
  const fromPvz = pvz?.from as { ref?: string; address?: { label?: string; fullAddress?: string } } | undefined;
  const toPvz = pvz?.to as { ref?: string; address?: { label?: string; fullAddress?: string } } | undefined;
  const fromDisplay = String(fromPvz?.address?.fullAddress ?? fromPvz?.address?.label ?? fromPvz?.ref ?? punktFrom).trim();
  const toDisplay = String(toPvz?.address?.fullAddress ?? toPvz?.address?.label ?? toPvz?.ref ?? punktTo).trim();
  return {
    CitySender: cityToCode(fromDisplay) || cityToCode(punktFrom) || punktFrom,
    CityReceiver: cityToCode(toDisplay) || cityToCode(punktTo) || punktTo,
    ПунктОтправкиНаименование: fromDisplay,
    ПунктНазначенияНаименование: toDisplay,
    АдресОтправки: fromDisplay,
    АдресНазначения: toDisplay,
  };
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

function pendingOrderMatchesDateRange(row: PendingOrderDbRow, dateFrom: string, dateTo: string): boolean {
  const created = dateOnly(row.created_at);
  const pickup = dateOnly(row.data_zabora);
  const inRange = (d: string) => Boolean(d) && d >= dateFrom && d <= dateTo;
  return inRange(created) || inRange(pickup);
}

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
  const senderName = partyDisplayName(fromParty, customer) || String(source?.customerName ?? "").trim();

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
    ОтправительНаименование: senderName,
    ПолучательНаименование: partyDisplayName(toParty),
    Статус: "Ожидает обработки",
    State: "Ожидает обработки",
    Комментарий: "Ожидает обработки в 1С",
    _pendingOrder: true,
    _pendingOrderId: row.id,
  };
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

function pendingMatchesScope(
  row: PendingOrderDbRow,
  scope: { inn?: string; name?: string },
): boolean {
  const item = pendingOrderToListItem(row);
  return orderMatchesCustomerScope(item, scope);
}

export async function fetchPendingOrdersForList(
  pool: Pool,
  login: string,
  dateFrom: string,
  dateTo: string,
  scope: { inn?: string; name?: string } | null,
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

  return rows
    .filter((row) => pendingOrderMatchesDateRange(row, dateFrom, dateTo))
    .filter((row) => {
      if (scope === null) return true;
      return pendingMatchesScope(row, scope);
    })
    .map(pendingOrderToListItem);
}

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
    const scopeInn = normalizePendingOrderInn(inn) || normalizePendingOrderInn(verified.inn);
    const scopeName = normalizeCompanyName(customerName);
    const scope =
      scopeInn || scopeName
        ? { inn: scopeInn || undefined, name: scopeName || undefined }
        : verified.accessAllInns
          ? null
          : null;
    const pending = await fetchPendingOrdersForList(pool, login, dateFrom, dateTo, scope);
    return mergeOrdersWithPending(list, pending);
  } catch {
    return list;
  }
}

export async function deletePendingOrderForUser(
  pool: Pool,
  login: string,
  pendingOrderId: number,
): Promise<boolean> {
  if (!Number.isFinite(pendingOrderId) || pendingOrderId < 1) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM pending_order_requests WHERE id = $1 AND lower(trim(login)) = $2`,
    [pendingOrderId, normalizeLogin(login)],
  );
  return (rowCount ?? 0) > 0;
}

export async function deletePendingOrdersByNomerZayavki(pool: Pool, nomerZayavki: string): Promise<number> {
  const number = String(nomerZayavki ?? "").trim();
  if (!number) return 0;
  try {
    const { rowCount } = await pool.query(`DELETE FROM pending_order_requests WHERE nomer_zayavki = $1`, [number]);
    return rowCount ?? 0;
  } catch {
    return 0;
  }
}
