import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

/**
 * Прокси для GetActs: УПД (универсальные передаточные документы).
 * Если в БД есть свежий кэш (обновлён кроном за 15 мин) и у пользователя есть INN в account_companies — отдаём из кэша.
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_FRESH_MINUTES = 15;

function actInn(item: any): string {
  const v = item?.INN ?? item?.Inn ?? item?.inn ?? "";
  return String(v).trim();
}

function actDate(item: any): string {
  const d = item?.DateDoc ?? item?.Date ?? item?.dateDoc ?? item?.date ?? "";
  return String(d).split("T")[0];
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
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res
      .status(400)
      .json({ error: "Invalid date format (YYYY-MM-DD required)" });
  }

  // Попытка отдать из кэша (не в serviceMode)
  if (!serviceMode) {
    try {
      const pool = getPool();
      const cacheRow = await pool.query<{ data: unknown[]; fetched_at: Date }>(
        "SELECT data, fetched_at FROM cache_acts WHERE id = 1 AND fetched_at > now() - interval '1 minute' * $1",
        [CACHE_FRESH_MINUTES]
      );
      if (cacheRow.rows.length > 0) {
        const userInnsRow = await pool.query<{ inn: string }>(
          "SELECT inn FROM account_companies WHERE login = $1",
          [String(login).trim().toLowerCase()]
        );
        const allowedInns = new Set(userInnsRow.rows.map((r) => r.inn.trim()).filter(Boolean));
        const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
        const filterInns = requestedInn
          ? (allowedInns.has(requestedInn) ? new Set([requestedInn]) : allowedInns)
          : allowedInns;
        if (filterInns.size > 0) {
          const data = cacheRow.rows[0].data as any[];
          const list = Array.isArray(data) ? data : [];
          const filtered = list.filter((item) => {
            const itemInnVal = actInn(item);
            if (!filterInns.has(itemInnVal)) return false;
            const d = actDate(item);
            return d >= dateFrom && d <= dateTo;
          });
          return res.status(200).json(Array.isArray(filtered) ? filtered : []);
        }
      }
    } catch {
      // БД недоступна или кэш пустой — идём в 1С
    }
  }

  const url = new URL(BASE_URL);
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
        const message = (errJson?.Error ?? errJson?.error ?? errJson?.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : text || upstream.statusText;
        return res.status(upstream.status).json({ error: errorText });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : "Ошибка авторизации";
        return res.status(401).json({ error: errorText });
      }
      const list = Array.isArray(json) ? json : (json?.items ?? json?.Acts ?? json?.acts ?? []);
      return res.status(200).json(Array.isArray(list) ? list : []);
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Acts proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
