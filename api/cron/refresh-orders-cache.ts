import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";

const ZAYAVKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function extractArrayFromAnyPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const known = [
    obj.items,
    obj.Items,
    obj.zayavki,
    obj.Zayavki,
    obj.data,
    obj.Data,
    obj.result,
    obj.Result,
    obj.rows,
    obj.Rows,
  ];
  for (const candidate of known) {
    if (Array.isArray(candidate)) return candidate;
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cron/refresh-orders-cache");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    logInfo(ctx, "cron_auth_failed", { status: cronAuthError.status });
    return res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
  }

  const login = process.env.PEREVOZKI_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD;
  if (!login || !password) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    logInfo(ctx, "cron_env_missing", { missing: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD" });
    return res
      .status(503)
      .send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка конфигурации</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка конфигурации</h1><p>В Vercel не заданы PEREVOZKI_SERVICE_LOGIN и PEREVOZKI_SERVICE_PASSWORD.</p></body></html>');
  }

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 10);
  const dateFrom = fromDate.toISOString().split("T")[0];

  const fetchServiceJson = async (url: string) => {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
    }
    if (json && typeof json === "object" && json.Success === false) {
      const err = String(json.Error ?? json.error ?? json.message ?? "Success=false");
      throw new Error(err);
    }
    return json;
  };

  const stepStatuses: Array<{ name: string; ok: boolean; count?: number; detail?: string }> = [];
  const markStep = (name: string, ok: boolean, count?: number, detail?: string) => {
    stepStatuses.push({ name, ok, count, detail });
  };

  try {
    const pool = getPool();
    await pool.query(
      "create table if not exists cache_orders (id int primary key default 1 check (id = 1), data jsonb not null default '[]', fetched_at timestamptz not null default now())"
    );
    await pool.query(
      "insert into cache_orders (id, data, fetched_at) values (1, '[]', '1970-01-01') on conflict (id) do nothing"
    );
    markStep("table", true);

    const errors: string[] = [];
    let source = "none";
    let ordersList: unknown[] = [];

    try {
      const directJson = await fetchServiceJson(`${ZAYAVKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`);
      const directList = extractArrayFromAnyPayload(directJson);
      if (directList.length > 0) {
        ordersList = directList;
        source = "GetZayavki";
      } else {
        errors.push("GetZayavki returned 0");
      }
    } catch (e: any) {
      errors.push(`GetZayavki: ${e?.message || String(e)}`);
    }

    if (ordersList.length === 0) {
      try {
        const apiJson = await fetchServiceJson(`${GETAPI_URL}?metod=GetZayavki&DateB=${dateFrom}&DateE=${dateTo}`);
        const apiList = extractArrayFromAnyPayload(apiJson);
        if (apiList.length > 0) {
          ordersList = apiList;
          source = "GETAPI?metod=GetZayavki";
        } else {
          errors.push("GETAPI GetZayavki returned 0");
        }
      } catch (e: any) {
        errors.push(`GETAPI GetZayavki: ${e?.message || String(e)}`);
      }
    }

    await pool.query("update cache_orders set data = $1, fetched_at = now() where id = 1", [JSON.stringify(ordersList)]);
    markStep("orders", true, ordersList.length, source === "none" ? errors.join(" | ") : source);

    const stepsHtml = stepStatuses
      .map((s) => {
        const color = s.ok ? "#16a34a" : "#dc2626";
        const countPart = typeof s.count === "number" ? `, count=${s.count}` : "";
        const detailPart = s.detail ? ` — ${escapeHtml(s.detail)}` : "";
        return `<li><span style="color:${color};font-weight:600;">${s.ok ? "OK" : "ERR"}</span> ${escapeHtml(s.name)}${countPart}${detailPart}</li>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Кэш заявок обновлён</title></head><body style="font-family:sans-serif;padding:2rem;max-width:48rem;margin:0 auto;background:#fff;color:#111;"><h1>Кэш заявок обновлён</h1><p>Заявок: <strong>${ordersList.length}</strong></p><p style="color:#666;font-size:0.9rem;">Период: ${dateFrom} — ${dateTo} (10 дней). Обновление отдельным кроном.</p><h3 style="margin-top:1.5rem;">Диагностика шагов</h3><ul style="line-height:1.55;">${stepsHtml}</ul></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    logInfo(ctx, "cron_refresh_orders_done", { orders_count: ordersList.length });
    return res.status(200).send(html);
  } catch (e: any) {
    logError(ctx, "cron_refresh_orders_failed", e);
    const msg = e?.message || String(e);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка обновления кэша заявок</h1><p>${escapeHtml(msg)}</p></body></html>`);
  }
}
