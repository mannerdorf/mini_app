import type { Pool } from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { upsertDocument } from "../lib/rag.js";
import { verifyRegisteredUser, type VerifiedRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { dispatchWebPushCargoEvents } from "./_lib/webpushEventDispatch.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import {
  getPerevozkiServiceCredentials,
  shouldServeFromDocumentCache,
} from "../lib/cacheHistoryDays.js";
import { handleHaulzSummarySandboxRequest, isHaulzSummarySandboxAction } from "../lib/haulzSummarySandboxApi.js";
import { getAdminTokenFromRequest, getAdminTokenPayload, verifyAdminToken } from "../lib/adminAuth.js";
import { fetchWithTimeout, upstreamTimeoutMessage } from "../lib/fetchWithTimeout.js";
import { preferCacheOnlyOnVercel } from "../lib/vercelRuntime.js";
import { isCargoInDateRangeForField, type CargoDateField } from "../lib/cargoDateFilter.js";
import {
  innColumnForPerevozkiMode,
  readDocumentsFromCacheByPeriod,
  readPerevozkiByNumbersFromCache,
} from "../lib/documentCacheRead.js";

function parseCargoDateField(raw: unknown): CargoDateField {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "prih" || v === "dateprih") return "prih";
  if (v === "vr" || v === "datevr" || v === "delivery") return "vr";
  return "default";
}

/**
 * Запрос данных перевозок — только этот метод:
 * GetPerevozki?DateB=...&DateE=...&INN=...
 * Если в БД есть свежий кэш (обновлён кроном за последние 15 мин) и у пользователя есть INN в account_companies — отдаём из кэша.
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_FRESH_MINUTES = 15;

type PerevozkiMode = "Customer" | "Sender" | "Receiver";

function firstInn(item: any, keys: string[]): string {
  for (const key of keys) {
    const raw = item?.[key];
    const value = String(raw ?? "").replace(/\D/g, "").trim();
    if (value) return value;
  }
  return "";
}

function itemInn(item: any, mode?: unknown): string {
  const normalizedMode = String(mode ?? "").trim() as PerevozkiMode | "";
  if (normalizedMode === "Sender") {
    return firstInn(item, [
      "SenderINN",
      "senderINN",
      "SenderInn",
      "senderInn",
      "INNSender",
      "InnSender",
      "ОтправительИНН",
      "ИННОтправителя",
      "ИННОтправитель",
      "INN_SENDER",
    ]);
  }
  if (normalizedMode === "Receiver") {
    return firstInn(item, [
      "ReceiverINN",
      "receiverINN",
      "ReceiverInn",
      "receiverInn",
      "INNReceiver",
      "InnReceiver",
      "ПолучательИНН",
      "ИННПолучателя",
      "ИННПолучатель",
      "INN_RECEIVER",
    ]);
  }
  const v =
    item?.INN ??
    item?.Inn ??
    item?.inn ??
    item?.CustomerINN ??
    item?.CustomerInn ??
    item?.customerInn ??
    item?.INNCustomer ??
    item?.InnCustomer ??
    item?.ЗаказчикИНН ??
    "";
  return String(v).trim();
}

function itemDate(item: any): string {
  const d =
    item?.DatePrih ??
    item?.DateVr ??
    item?.DateDelivery ??
    item?.DeliveryDate ??
    item?.PlanDate ??
    item?.PlanDeliveryDate ??
    item?.DateArrival ??
    item?.DateDoc ??
    item?.DateOtpr ??
    item?.DateShipment ??
    item?.ShipmentDate ??
    "";
  return normalizeDateOnly(d);
}

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

export function perevozkiItemInn(item: any): string {
  return itemInn(item);
}

export function perevozkiItemInnForMode(item: any, mode?: unknown): string {
  return itemInn(item, mode);
}

function normalizeCargoNumberForLookup(value: unknown): string {
  return String(value ?? "").replace(/^0000-/, "").trim().replace(/^0+/, "") || "";
}

function perevozkiItemNumber(item: any): string {
  return normalizeCargoNumberForLookup(item?.Number ?? item?.number ?? item?.НомерПеревозки ?? "");
}

/** Перевозки из cache_perevozki по номерам — без фильтра по дате (для привязки к рейсу). */
export async function readPerevozkiFromCacheByNumbers(
  pool: Pool,
  numbers: string[],
): Promise<any[]> {
  return readPerevozkiByNumbersFromCache(pool, numbers);
}

function mergePerevozkiByNumber(primary: any[], extra: any[]): any[] {
  if (!extra.length) return primary;
  const byNumber = new Map<string, any>();
  for (const item of primary) {
    const key = perevozkiItemNumber(item);
    if (key) byNumber.set(key, item);
  }
  for (const item of extra) {
    const key = perevozkiItemNumber(item);
    if (key && !byNumber.has(key)) byNumber.set(key, item);
  }
  return Array.from(byNumber.values());
}

function filterPerevozkiListForRegistered(
  list: any[],
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  serviceMode: unknown,
  mode?: unknown,
  allowedInnsFromDb?: Set<string>,
  dateField: CargoDateField = "default",
): any[] {
  const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
  const isServiceMode = !!serviceMode;
  let filterInns: Set<string> | null = null;
  if (!isServiceMode && !verified.accessAllInns) {
    const allowed = new Set(allowedInnsFromDb ?? []);
    if (verified.inn?.trim()) allowed.add(verified.inn.trim());
    filterInns = allowed.size > 0 ? allowed : verified.inn ? new Set([verified.inn]) : null;
  }
  const finalInns = isServiceMode
    ? null
    : filterInns === null
      ? requestedInn
        ? new Set([requestedInn])
        : null
      : requestedInn
        ? filterInns.has(requestedInn)
          ? new Set([requestedInn])
          : new Set<string>()
        : filterInns;
  return list.filter((item) => {
    if (finalInns !== null) {
      const itemInnVal = itemInn(item, mode);
      if (!finalInns.has(itemInnVal)) return false;
    }
    return isCargoInDateRangeForField(item, dateFrom, dateTo, dateField);
  });
}

/** Кэш перевозок для зарегистрированного пользователя (без 1С). Используется из `/api/perevozki` и partner/v1 с пользовательским ключом. */
export async function readRegisteredPerevozkiFromCache(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
  serviceMode: unknown,
  mode?: unknown,
  dateField: CargoDateField = "default",
): Promise<any[]> {
  try {
    let allowedInnsFromDb: Set<string> | undefined;
    if (!serviceMode && !verified.accessAllInns) {
      const acRows = await pool.query<{ inn: string }>(
        "SELECT inn FROM account_companies WHERE login = $1",
        [String(login).trim().toLowerCase()],
      );
      allowedInnsFromDb = new Set(acRows.rows.map((r) => r.inn.trim()).filter(Boolean));
    }
    const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
    const isServiceMode = !!serviceMode;
    let filterInns: Set<string> | null = null;
    if (!isServiceMode && !verified.accessAllInns) {
      const allowed = new Set(allowedInnsFromDb ?? []);
      if (verified.inn?.trim()) allowed.add(verified.inn.trim());
      filterInns = allowed.size > 0 ? allowed : verified.inn ? new Set([verified.inn]) : null;
    }
    const finalInns = isServiceMode
      ? null
      : filterInns === null
        ? requestedInn
          ? new Set([requestedInn])
          : null
        : requestedInn
          ? filterInns.has(requestedInn)
            ? new Set([requestedInn])
            : new Set<string>()
          : filterInns;

    const { items, fromNormalized } = await readDocumentsFromCacheByPeriod(pool, "perevozki", dateFrom, dateTo, {
      dateField,
      inns: finalInns,
      innColumn: innColumnForPerevozkiMode(mode),
    });
    if (fromNormalized) return items;

    return filterPerevozkiListForRegistered(
      items,
      verified,
      login,
      dateFrom,
      dateTo,
      inn,
      serviceMode,
      mode,
      allowedInnsFromDb,
      dateField,
    );
  } catch {
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "perevozki");
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

  if (isHaulzSummarySandboxAction(body?.action)) {
    const handled = await handleHaulzSummarySandboxRequest(req, res, ctx.requestId);
    if (handled) return;
  }

  const {
    login,
    password,
    dateFrom = "2024-01-01",
    dateTo = new Date().toISOString().split("T")[0],
    inn,
    mode,
    serviceMode,
    isRegisteredUser,
    includeCargoNumbers,
    dateField: dateFieldRaw,
  } = body || {};
  const dateField = parseCargoDateField(dateFieldRaw);

  const extraCargoNumbers = Array.isArray(includeCargoNumbers)
    ? includeCargoNumbers.map((n: unknown) => String(n ?? "").trim()).filter(Boolean)
    : [];

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }

  const useDocumentCache = shouldServeFromDocumentCache(dateFrom, dateTo);
  let registeredVerified: VerifiedRegisteredUser | null = null;

  const adminToken =
    (typeof body?.adminToken === "string" ? body.adminToken.trim() : "") || getAdminTokenFromRequest(req) || "";
  if (
    useDocumentCache &&
    adminToken &&
    verifyAdminToken(adminToken) &&
    getAdminTokenPayload(adminToken)?.superAdmin === true
  ) {
    try {
      const pool = getPool();
      const { items } = await readDocumentsFromCacheByPeriod(pool, "perevozki", dateFrom, dateTo, { dateField });
      const filtered = items.filter((item) =>
        isCargoInDateRangeForField(item, dateFrom, dateTo, dateField),
      );
      return res.status(200).json(Array.isArray(filtered) ? filtered : []);
    } catch (e) {
      logError(ctx, "perevozki_admin_cache_failed", e);
      return res.status(500).json({ error: "Ошибка чтения кэша перевозок", request_id: ctx.requestId });
    }
  }

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login, password);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
      }
      registeredVerified = verified;
      if (useDocumentCache) {
        const filtered = await readRegisteredPerevozkiFromCache(
          pool,
          verified,
          login,
          dateFrom,
          dateTo,
          inn,
          serviceMode,
          mode,
          dateField,
        );
        let result = Array.isArray(filtered) ? filtered : [];
        if (extraCargoNumbers.length > 0) {
          const extra = await readPerevozkiFromCacheByNumbers(pool, extraCargoNumbers);
          result = mergePerevozkiByNumber(result, extra);
        }
        return res.status(200).json(Array.isArray(result) ? result : []);
      }
    } catch (e) {
      logError(ctx, "perevozki_registered_user_failed", e);
      return res.status(200).json([]);
    }
  }

  const normalizedMode = String(mode ?? "").trim();
  const canUseRoleAgnosticCache = !normalizedMode || normalizedMode === "Customer";

  if (useDocumentCache && (serviceMode || canUseRoleAgnosticCache)) {
    try {
      const pool = getPool();
      const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
      let filterInns: Set<string> | null = null;
      if (!serviceMode) {
        const userInnsRow = await pool.query<{ inn: string }>(
          "SELECT inn FROM account_companies WHERE login = $1",
          [String(login).trim().toLowerCase()],
        );
        const allowedInns = new Set(userInnsRow.rows.map((r) => r.inn.trim()).filter(Boolean));
        filterInns = requestedInn
          ? allowedInns.has(requestedInn)
            ? new Set([requestedInn])
            : new Set<string>()
          : allowedInns;
      }
      const { items, fromNormalized } = await readDocumentsFromCacheByPeriod(pool, "perevozki", dateFrom, dateTo, {
        dateField,
        inns: serviceMode ? null : filterInns,
        innColumn: innColumnForPerevozkiMode(mode),
      });
      if (items.length > 0 || fromNormalized) {
        if (serviceMode) {
          const filtered = items.filter((item) =>
            isCargoInDateRangeForField(item, dateFrom, dateTo, dateField),
          );
          return res.status(200).json(Array.isArray(filtered) ? filtered : []);
        }
        if (filterInns && filterInns.size > 0) {
          const filtered = fromNormalized
            ? items
            : items.filter((item) => {
                const itemInnVal = itemInn(item, mode);
                if (!filterInns!.has(itemInnVal)) return false;
                return isCargoInDateRangeForField(item, dateFrom, dateTo, dateField);
              });
          return res.status(200).json(Array.isArray(filtered) ? filtered : []);
        }
      }
    } catch {
      if (preferCacheOnlyOnVercel()) {
        return res.status(200).json([]);
      }
      // БД недоступна или кэш пустой — идём в 1С
    }
  }

  if (preferCacheOnlyOnVercel()) {
    return res.status(200).json([]);
  }

  // Запрос данных перевозок: DateB, DateE; при serviceMode не передаём INN и Mode
  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (!serviceMode) {
    if (inn) {
      url.searchParams.set("INN", String(inn).trim());
    }
    const validModes = ["Customer", "Sender", "Receiver"];
    if (mode && validModes.includes(String(mode))) {
      url.searchParams.set("Mode", String(mode));
    }
  }

  let upstreamLogin = String(login);
  let upstreamPassword = String(password);
  if (isRegisteredUser && registeredVerified) {
    const serviceCreds = getPerevozkiServiceCredentials();
    if (!serviceCreds) {
      return res.status(503).json({
        error: "Service credentials are not configured",
        request_id: ctx.requestId,
      });
    }
    upstreamLogin = serviceCreds.login;
    upstreamPassword = serviceCreds.password;
    if (inn && String(inn).trim()) url.searchParams.set("INN", String(inn).trim());
  }

  try {
    console.log("➡️ Perevozki request for:", login);
    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: {
          Auth: `Basic ${upstreamLogin}:${upstreamPassword}`,
          Authorization: SERVICE_AUTH,
        },
      },
      50_000,
    );

    console.log("⬅️ Upstream status:", upstream.status);
    const text = await upstream.text();
    console.log("⬅️ Upstream body start:", text.substring(0, 100));

    if (!upstream.ok) {
      try {
        const errJson = JSON.parse(text) as Record<string, unknown>;
        const message = (errJson?.Error ?? errJson?.error ?? errJson?.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : text || upstream.statusText;
        return res.status(upstream.status).json({ error: errorText, request_id: ctx.requestId });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    // Если 1С вернула Success: false — только текст ошибки ("Не найден пользователь", "Неверный пароль" и т.д.), без JSON.
    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : "Ошибка авторизации";
        return res.status(401).json({ error: errorText, request_id: ctx.requestId });
      }
      let list = Array.isArray(json) ? json : json.items || [];
      if (isRegisteredUser && registeredVerified) {
        try {
          const pool = getPool();
          let allowedInnsFromDb: Set<string> | undefined;
          if (!serviceMode && !registeredVerified.accessAllInns) {
            const acRows = await pool.query<{ inn: string }>(
              "SELECT inn FROM account_companies WHERE login = $1",
              [String(login).trim().toLowerCase()],
            );
            allowedInnsFromDb = new Set(acRows.rows.map((r) => r.inn.trim()).filter(Boolean));
          }
          list = filterPerevozkiListForRegistered(
            Array.isArray(list) ? list : [],
            registeredVerified,
            login,
            dateFrom,
            dateTo,
            inn,
            serviceMode,
            mode,
            allowedInnsFromDb,
            dateField,
          );
        } catch (filterErr: any) {
          logError(ctx, "perevozki_registered_1c_filter_failed", filterErr);
          list = [];
        }
      }
      let mergedList = list;
      if (extraCargoNumbers.length > 0) {
        try {
          const pool = getPool();
          const extra = await readPerevozkiFromCacheByNumbers(pool, extraCargoNumbers);
          mergedList = mergePerevozkiByNumber(list, extra);
        } catch (mergeErr: any) {
          console.error("perevozki includeCargoNumbers merge failed:", mergeErr?.message || mergeErr);
        }
      }
      if (Array.isArray(mergedList) && mergedList.length > 0) {
        ingestCargoItems(mergedList, login).catch((error) => {
          console.error("RAG cargo ingest error:", error?.message || error);
        });
        try {
          const pool = getPool();
          await dispatchWebPushCargoEvents({
            pool,
            items: mergedList as any[],
            source: "api_perevozki",
            dedupeTtlSeconds: 300,
          });
        } catch (error: any) {
          console.error("webpush event dispatch from perevozki failed:", error?.message || error);
        }
      }
      return res.status(200).json(Array.isArray(json) ? mergedList : { ...json, items: mergedList });
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: unknown) {
    logError(ctx, "perevozki_proxy_failed", e);
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return res.status(isTimeout ? 504 : 500).json({
      error: upstreamTimeoutMessage(e),
      request_id: ctx.requestId,
    });
  }
}

function formatCargoContent(item: any) {
  const number = item?.Number ?? item?.number ?? "";
  const customer = item?.Customer ?? item?.customer ?? "";
  const lines = [
    `Перевозка: ${number}`,
    `Заказчик: ${customer}`,
    `Статус: ${item?.State ?? ""}`,
    `Дата приемки: ${item?.DatePrih ?? ""}`,
    `Дата доставки: ${item?.DateVr ?? ""}`,
    `Отправитель: ${item?.Sender ?? ""}`,
    `Мест: ${item?.Mest ?? ""}`,
    `Платный вес: ${item?.PW ?? ""}`,
    `Вес: ${item?.W ?? ""}`,
    `Объем: ${item?.Value ?? ""}`,
    `Сумма: ${item?.Sum ?? ""}`,
    `Статус счета: ${item?.StateBill ?? ""}`,
  ];

  return lines.filter((line) => !line.endsWith(": ")).join("\n");
}

async function ingestCargoItems(items: any[], login: string) {
  const batchSize = 5;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (item) => {
        const number = item?.Number ?? item?.number;
        if (!number) return;
        const customer = item?.Customer ?? item?.customer ?? null;
        const sourceId = `${customer || login}:${number}`;
        const content = formatCargoContent(item);
        if (!content) return;
        await upsertDocument({
          sourceType: "cargo",
          sourceId,
          title: `Перевозка ${number}`,
          content,
          metadata: {
            number,
            customer,
            datePrih: item?.DatePrih ?? null,
            dateVr: item?.DateVr ?? null,
            state: item?.State ?? null,
            sender: item?.Sender ?? null,
          },
        });
      }),
    );
  }
}
