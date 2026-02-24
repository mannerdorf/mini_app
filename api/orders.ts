import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

/**
 * Прокси для GetZayavki в разделе "Заявки".
 * Использует отдельный кэш cache_orders (обновляется кроном раз в 15 минут).
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_FRESH_MINUTES = 15;

function getFirstNonEmpty(item: any, keys: string[]): string {
  for (const key of keys) {
    const v = item?.[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function orderInn(item: any): string {
  return getFirstNonEmpty(item, [
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
  ]);
}

function extractItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const list = raw.items ?? raw.Items ?? raw.zayavki ?? raw.Zayavki ?? raw.data ?? raw.Data ?? raw.result ?? raw.Result ?? raw.rows ?? raw.Rows ?? [];
  if (Array.isArray(list)) return list;
  for (const value of Object.values(raw)) {
    if (Array.isArray(value)) return value;
  }
  return [];
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
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
    return res.status(400).json({ error: "login and password are required" });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)" });
  }

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login, password);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль" });
      }
      let cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
        "SELECT data, fetched_at FROM cache_orders WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
        [CACHE_FRESH_MINUTES]
      );
      if (cacheRow.rows.length === 0) {
        cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
          "SELECT data, fetched_at FROM cache_orders WHERE id = 1"
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
        const data = cacheRow.rows[0].data as any[];
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter((item) => {
          if (finalInns !== null) {
            const itemInnVal = orderInn(item);
            if (!finalInns.has(itemInnVal)) return false;
          }
          const d = orderDate(item);
          return !d || (d >= dateFrom && d <= dateTo);
        });
        if (filtered.length > 0) return res.status(200).json(filtered);
      }
      return res.status(200).json([]);
    } catch (e) {
      console.error("orders registered user error:", e);
      return res.status(200).json([]);
    }
  }

  try {
    const pool = getPool();
    let cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
      "SELECT data, fetched_at FROM cache_orders WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
      [CACHE_FRESH_MINUTES]
    );
    if (cacheRow.rows.length === 0) {
      cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
        "SELECT data, fetched_at FROM cache_orders WHERE id = 1"
      );
    }
    if (cacheRow.rows.length > 0) {
      const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
      const isService = !!serviceMode;
      let filterInns: Set<string> | null = null;
      if (!isService) {
        const userInnsRow = await pool.query<{ inn: string }>(
          "SELECT inn FROM account_companies WHERE login = $1",
          [String(login).trim().toLowerCase()]
        );
        const allowedInns = new Set(userInnsRow.rows.map((r) => r.inn.trim()).filter(Boolean));
        filterInns = requestedInn
          ? (allowedInns.has(requestedInn) ? new Set([requestedInn]) : new Set<string>())
          : allowedInns;
      }
      const finalInns = isService ? null : filterInns;
      const data = cacheRow.rows[0].data as any[];
      const list = Array.isArray(data) ? data : [];
      const filtered = list.filter((item) => {
        if (finalInns !== null) {
          const itemInnVal = orderInn(item);
          if (!finalInns.has(itemInnVal)) return false;
        }
        const d = orderDate(item);
        return !d || (d >= dateFrom && d <= dateTo);
      });
      if ((isService || (finalInns && finalInns.size > 0)) && filtered.length > 0) {
        return res.status(200).json(filtered);
      }
    }
  } catch {
    // БД недоступна/кэш пустой — идем в 1С
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (!serviceMode) {
    if (inn && String(inn).trim()) url.searchParams.set("INN", String(inn).trim());
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
        return res.status(upstream.status).json({ error: errorText });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : "Ошибка авторизации";
        return res.status(401).json({ error: errorText });
      }
      const list = extractItems(json);
      return res.status(200).json(Array.isArray(list) ? list : []);
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Orders proxy error:", e);
    return res.status(500).json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
