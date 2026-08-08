import type { Pool } from "pg";
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
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function tableRowByType(tableRows: unknown[], type: string): Record<string, unknown> | undefined {
  const row = tableRows.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === type);
  return row as Record<string, unknown> | undefined;
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

  return {
    Дата: createdDate,
    DateZayavki: createdDate,
    НомерЗаявки: row.nomer_zayavki,
    ДатаЗабораПлан: pickupDate,
    PickupDatePlan: pickupDate,
    ПунктОтправки: row.punkt_otpravki,
    ПунктНазначения: row.punkt_naznacheniya,
    ЗаказчикНаименование: String(source?.customerName ?? customer?.fullName ?? "").trim(),
    ЗаказчикИНН: inn,
    CustomerINN: inn,
    INN: inn,
    ОтправительНаименование: String(fromParty?.fullName ?? "").trim(),
    ПолучательНаименование: String(toParty?.fullName ?? "").trim(),
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

  return rows
    .filter((row) => pendingOrderMatchesDateRange(row, dateFrom, dateTo))
    .filter((row) => {
      if (filterInns === null) return true;
      const itemInn = normalizePendingOrderInn(row.inn);
      return itemInn && filterInns.has(itemInn);
    })
    .map(pendingOrderToListItem);
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
