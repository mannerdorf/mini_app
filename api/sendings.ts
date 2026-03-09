import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_FRESH_MINUTES = 15;

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
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

function pickInn(item: any): string {
  const candidates = [
    item?.CustomerINN,
    item?.customerINN,
    item?.CustomerInn,
    item?.customerInn,
    item?.SenderINN,
    item?.senderINN,
    item?.InnSender,
    item?.INNSender,
    item?.SenderInn,
    item?.senderInn,
    item?.ИННОтправителя,
    item?.ИННОтправитель,
    item?.INN_SENDER,
    item?.INN,
    item?.Inn,
    item?.inn,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

function pickSendingNumber(item: any): string {
  const candidates = [
    item?.SendingNumber,
    item?.sendingNumber,
    item?.NumberSend,
    item?.NumberSending,
    item?.НомерОтправки,
    item?.НомерОтправления,
    item?.НомерОтпр,
    item?.Номер,
    item?.Number,
    item?.number,
    item?.ИДОтправления,
    item?.ID,
    item?.Id,
    item?.id,
    item?.Ref_Key,
    item?.RefKey,
    item?.GUID,
    item?.Guid,
    item?.guid,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

async function attachMetricsToSendings(
  pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  list: any[]
): Promise<any[]> {
  if (!Array.isArray(list) || list.length === 0) return list;

  const keys = list
    .map((row) => ({
      customer_inn: normalizeInn(pickInn(row)),
      sending_number: pickSendingNumber(row),
    }))
    .filter((k) => k.sending_number);
  if (!keys.length) return list;

  const metricsRes = await pool.query<{
    customer_inn: string;
    sending_number: string;
    in_transit_hours: number | null;
    send_start_at: string | null;
    first_ready_at: string | null;
  }>(
    `with src as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(customer_inn text, sending_number text)
     ),
     s_numbers as (
       select distinct sending_number from src where sending_number <> ''
     )
     select m.customer_inn, m.sending_number, m.in_transit_hours, m.send_start_at, m.first_ready_at
     from sendings_metrics m
     join s_numbers n on n.sending_number = m.sending_number`,
    [JSON.stringify(keys)]
  );

  const byInnAndSending = new Map<string, (typeof metricsRes.rows)[number]>();
  const bySendingUnique = new Map<string, (typeof metricsRes.rows)[number]>();
  const sendingCounts = new Map<string, number>();

  metricsRes.rows.forEach((row) => {
    const inn = normalizeInn(row.customer_inn);
    const sending = String(row.sending_number || "").trim();
    if (!sending) return;
    byInnAndSending.set(`${inn}|${sending}`, row);
    sendingCounts.set(sending, (sendingCounts.get(sending) || 0) + 1);
  });
  metricsRes.rows.forEach((row) => {
    const sending = String(row.sending_number || "").trim();
    if (!sending) return;
    if ((sendingCounts.get(sending) || 0) === 1) {
      bySendingUnique.set(sending, row);
    }
  });

  return list.map((row) => {
    const inn = normalizeInn(pickInn(row));
    const sending = pickSendingNumber(row);
    const metric = byInnAndSending.get(`${inn}|${sending}`) ?? bySendingUnique.get(sending);
    if (!metric) return row;
    return {
      ...row,
      in_transit_hours: metric.in_transit_hours,
      send_start_at_metric: metric.send_start_at,
      first_ready_at_metric: metric.first_ready_at,
    };
  });
}

function pickDate(item: any): string {
  const dateValue =
    item?.DateOtpr ??
    item?.DateSend ??
    item?.DateShipment ??
    item?.ShipmentDate ??
    item?.DateDoc ??
    item?.Date ??
    item?.date ??
    item?.ДатаОтправки ??
    item?.Дата ??
    item?.DatePrih ??
    item?.DateVr ??
    "";
  return normalizeDateOnly(dateValue);
}

function extractItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.Items)) return raw.Items;
  if (Array.isArray(raw.otpravki)) return raw.otpravki;
  if (Array.isArray(raw.Otpravki)) return raw.Otpravki;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.Data)) return raw.Data;
  if (Array.isArray(raw.result)) return raw.result;
  if (Array.isArray(raw.Result)) return raw.Result;
  if (Array.isArray(raw.rows)) return raw.rows;
  if (Array.isArray(raw.Rows)) return raw.Rows;
  for (const value of Object.values(raw)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "sendings");
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
    serviceMode,
    isRegisteredUser,
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }

  const filterCachedItems = (list: any[], finalInns: Set<string> | null) =>
    list.filter((item) => {
      if (finalInns !== null) {
        const itemInn = pickInn(item);
        if (!finalInns.has(itemInn)) return false;
      }
      const d = pickDate(item);
      return !d || (d >= dateFrom && d <= dateTo);
    });

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login, password);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
      }
      let cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
        "SELECT data, fetched_at FROM cache_sendings WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
        [CACHE_FRESH_MINUTES]
      );
      if (cacheRow.rows.length === 0) {
        cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
          "SELECT data, fetched_at FROM cache_sendings WHERE id = 1"
        );
      }
      if (cacheRow.rows.length > 0) {
        const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
        const isService = !!serviceMode;
        let filterInns: Set<string> | null = null;
        if (!isService && !verified.accessAllInns) {
          const acRows = await pool.query<{ inn: string }>(
            "SELECT inn FROM account_companies WHERE login = $1",
            [String(login).trim().toLowerCase()]
          );
          const allowed = new Set(acRows.rows.map((r) => r.inn.trim()).filter(Boolean));
          if (verified.inn?.trim()) allowed.add(verified.inn.trim());
          filterInns = allowed.size > 0 ? allowed : (verified.inn ? new Set([verified.inn]) : null);
        }
        const finalInns = isService
          ? null
          : (filterInns === null
            ? (requestedInn ? new Set([requestedInn]) : null)
            : requestedInn
              ? (filterInns.has(requestedInn) ? new Set([requestedInn]) : new Set<string>())
              : filterInns);
        const list = Array.isArray(cacheRow.rows[0].data) ? (cacheRow.rows[0].data as any[]) : [];
        const filtered = filterCachedItems(list, finalInns);
        const withMetrics = await attachMetricsToSendings(pool, filtered);
        return res.status(200).json(withMetrics);
      }
      return res.status(200).json([]);
    } catch (e) {
      logError(ctx, "sendings_registered_user_failed", e);
      return res.status(200).json([]);
    }
  }

  try {
    const pool = getPool();
    let cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
      "SELECT data, fetched_at FROM cache_sendings WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
      [CACHE_FRESH_MINUTES]
    );
    if (cacheRow.rows.length === 0) {
      cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
        "SELECT data, fetched_at FROM cache_sendings WHERE id = 1"
      );
    }
    if (cacheRow.rows.length > 0) {
      const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
      const isService = !!serviceMode;
      let finalInns: Set<string> | null = null;
      if (!isService) {
        const userInnsRow = await pool.query<{ inn: string }>(
          "SELECT inn FROM account_companies WHERE login = $1",
          [String(login).trim().toLowerCase()]
        );
        const allowed = new Set(userInnsRow.rows.map((r) => r.inn.trim()).filter(Boolean));
        finalInns = requestedInn
          ? (allowed.has(requestedInn) ? new Set([requestedInn]) : new Set<string>())
          : allowed;
      }
      const list = Array.isArray(cacheRow.rows[0].data) ? (cacheRow.rows[0].data as any[]) : [];
      const filtered = filterCachedItems(list, finalInns);
      const withMetrics = await attachMetricsToSendings(pool, filtered);
      if ((isService || (finalInns && finalInns.size > 0)) && filtered.length > 0) {
        return res.status(200).json(withMetrics);
      }
    }
  } catch {
    // Fallback to upstream
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("metod", "Getotpravki");
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (!serviceMode && inn && String(inn).trim()) {
    url.searchParams.set("INN", String(inn).trim());
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
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
    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : "Ошибка авторизации";
        return res.status(401).json({ error: errorText, request_id: ctx.requestId });
      }
      return res.status(200).json(extractItems(json));
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    logError(ctx, "sendings_proxy_failed", e);
    return res.status(500).json({ error: "Proxy error", details: e?.message || String(e), request_id: ctx.requestId });
  }
}
