import { diagnoseOrders } from "../../lib/ordersDiagnostics.js";
import { resolveCompanyAccess, CompanyAccessError } from "../../lib/companyAccess.js";
import { resolveOrdersAccessInns } from "../../lib/ordersAccess.js";
import type { Pool } from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { verifyRegisteredUser, type VerifiedRegisteredUser } from "../../lib/verifyRegisteredUser.js";

import { respondCorsPreflight } from "../_lib/cors.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { appendPendingOrdersForUser } from "../../lib/pendingOrderRequests.js";
import {
  getOrderCustomerInn,
  normalizeCompanyName,
  normalizeOrderInn,
  orderMatchesCustomerScope,
} from "../../lib/orderCustomerScope.js";

/**
 * Прокси для GetZayavki в разделе "Заявки".
 * Использует отдельный кэш cache_orders (обновляется кроном раз в 15 минут).
 */
const CACHE_FRESH_MINUTES = 15;

function getFirstNonEmpty(item: any, keys: string[]): string {
  for (const key of keys) {
    const v = item?.[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export function ordersItemInn(item: any): string {
  const customerInn = getOrderCustomerInn(item);
  if (customerInn) return customerInn;
  return normalizeOrderInn(getFirstNonEmpty(item, [
    "INN",
    "Inn",
    "inn",
    "CustomerINN",
    "CustomerInn",
    "customerInn",
    "INNCustomer",
    "InnCustomer",
    "КонтрагентИНН",
    "ИНН",
    "ИННЗаказчика",
    "INN_CUSTOMER",
    "ПолучательИНН",
    "ReceiverINN",
    "ReceiverInn",
    "INNReceiver",
    "InnReceiver",
    "ОтправительИНН",
    "SenderINN",
    "SenderInn",
    "INNSender",
    "InnSender",
  ]));
}

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // 24.02.2026 and 24.02.2026 15:30:00
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function orderDate(item: any): string {
  const d = item?.DateZayavki ?? item?.DateRequest ?? item?.DateDoc ?? item?.Date ?? item?.date ?? item?.ДатаЗаявки ?? item?.Дата ?? "";
  return normalizeDateOnly(d);
}

export async function filterRegisteredOrdersList(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  serviceMode: unknown,
  list: any[],
  customerName?: unknown,
): Promise<any[]> {
  const finalInns = await resolveOrdersAccessInns(pool, verified, login, inn, serviceMode);
  const scopeName = normalizeCompanyName(customerName);
  return list.filter((item) => {
    if (finalInns !== null) {
      if (![...finalInns].some(allowedInn => orderMatchesCustomerScope(item, { inn: allowedInn }))) return false;
    }
    if (scopeName && !orderMatchesCustomerScope(item, { name: scopeName })) return false;
    const d = orderDate(item);
    return !d || (d >= dateFrom && d <= dateTo);
  });
}

/** Кэш заявок для зарегистрированного пользователя. */
export async function readRegisteredOrdersFromCache(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  serviceMode: unknown,
  customerName?: unknown,
  onMetadata?: (metadata: { fetchedAt: string | null; stale: boolean }) => void,
): Promise<any[]> {
  let cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
    "SELECT data, fetched_at FROM cache_orders WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
    [CACHE_FRESH_MINUTES],
  );
  if (cacheRow.rows.length === 0) {
    cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
      "SELECT data, fetched_at FROM cache_orders WHERE id = 1",
    );
  }
  if (cacheRow.rows.length === 0) throw new Error("Orders cache is not initialized");
  const fetchedAt = new Date(cacheRow.rows[0].fetched_at).getTime();
  onMetadata?.({ fetchedAt: Number.isFinite(fetchedAt) ? new Date(fetchedAt).toISOString() : null,
    stale: !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_FRESH_MINUTES * 60_000 });
  const data = cacheRow.rows[0].data as any[];
  if (!Array.isArray(data)) throw new Error("Invalid orders cache payload");
  const list = data;
  const filtered = await filterRegisteredOrdersList(
    pool,
    verified,
    login,
    dateFrom,
    dateTo,
    inn,
    serviceMode,
    list,
    customerName,
  );
  return appendPendingOrdersForUser(
    pool,
    verified,
    login,
    dateFrom,
    dateTo,
    inn,
    serviceMode,
    filtered,
    customerName,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "orders");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const {
    login,
    password,
    dateFrom = "2024-01-01",
    dateTo = new Date().toISOString().split("T")[0],
    inn,
    customerName,
    serviceMode,
    isRegisteredUser,
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo) || dateFrom > dateTo) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    // Resolve identity server-side; the client flag is not an authorization boundary.
    const existing = await pool.query("SELECT login FROM registered_users WHERE lower(trim(login))=$1", [String(login).trim().toLowerCase()]);
    let metadata: { fetchedAt: string | null; stale: boolean } = { fetchedAt: null, stale: true };
    let items: any[];
    if (existing.rows.length || isRegisteredUser) {
      const verified = await verifyRegisteredUser(pool, login, password);
      if (!verified) return res.status(401).json({error:"Неверный логин или пароль"});
      if (body.diagnostics === true) {
        const scope = await resolveOrdersAccessInns(pool,verified,login,inn,serviceMode);
        return res.status(200).json(await diagnoseOrders(pool, {
          matchesScope: row => scope === null || [...scope].some(allowed => orderMatchesCustomerScope(row,{inn:allowed})),
          dateOf:orderDate,dateFrom,dateTo,customerName,requestId:ctx.requestId,
        }));
      }
      items = await readRegisteredOrdersFromCache(pool,verified,login,dateFrom,dateTo,inn,serviceMode,customerName,value=>{metadata=value;});
    } else {
      const access = await resolveCompanyAccess(pool,login,password);
      if (body.diagnostics === true) {
        const requested = normalizeOrderInn(inn);
        return res.status(200).json(await diagnoseOrders(pool, {
          matchesScope: row => access.customers.some(customer=>orderMatchesCustomerScope(row,{inn:customer.inn})) &&
            (!requested || orderMatchesCustomerScope(row,{inn:requested})),
          dateOf:orderDate,dateFrom,dateTo,customerName,requestId:ctx.requestId,
        }));
      }
      const row = (await pool.query("SELECT data,fetched_at FROM cache_orders WHERE id=1")).rows[0];
      if (!Array.isArray(row?.data)) throw new Error("Orders cache is not initialized");
      const fetched = new Date(row.fetched_at).getTime();
      metadata = {fetchedAt:Number.isFinite(fetched)?new Date(fetched).toISOString():null,stale:!Number.isFinite(fetched)||Date.now()-fetched>15*60000};
      const requestedInn = normalizeOrderInn(inn);
      const name = normalizeCompanyName(customerName);
      items = row.data.filter((item:any)=>access.customers.some(customer=>orderMatchesCustomerScope(item,{inn:customer.inn})) &&
        (!requestedInn || orderMatchesCustomerScope(item,{inn:requestedInn})) &&
        (!name || orderMatchesCustomerScope(item,{name})) &&
        (!orderDate(item) || (orderDate(item)>=dateFrom && orderDate(item)<=dateTo)));
    }
    return res.status(200).json(body.withMetadata === true ? {items,metadata} : items);
  } catch(error) {
    if (error instanceof CompanyAccessError) return res.status(error.status).json({error:error.message});
    logError(ctx,"orders_cache_failed",error);
    return res.status(503).json({error:"Не удалось загрузить заявки из БД. Попробуйте позже.",code:"ORDERS_UNAVAILABLE",request_id:ctx.requestId});
  }
}
