import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { buildSendingsMetrics, extractArrayFromAnyPayload, upsertSendingsMetrics } from "../lib/sendingsMetrics.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function toIsoDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function addDays(baseIso: string, delta: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

async function fetchServiceJson(url: string, login: string, password: string) {
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-backfill-sendings-metrics");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const serviceLogin = String(process.env.PEREVOZKI_SERVICE_LOGIN || "").trim();
  const servicePassword = String(process.env.PEREVOZKI_SERVICE_PASSWORD || "").trim();
  if (!serviceLogin || !servicePassword) {
    return res.status(503).json({ error: "Не заданы PEREVOZKI_SERVICE_LOGIN / PEREVOZKI_SERVICE_PASSWORD", request_id: ctx.requestId });
  }

  const today = new Date().toISOString().split("T")[0];
  const defaultFrom = addDays(today, -365);
  const dateFrom = toIsoDate(body?.dateFrom) || defaultFrom;
  const dateTo = toIsoDate(body?.dateTo) || today;
  if (dateFrom > dateTo) {
    return res.status(400).json({ error: "dateFrom не может быть больше dateTo", request_id: ctx.requestId });
  }

  const chunkDays = Math.max(1, Math.min(90, Number(body?.chunkDays) || 30));
  const maxChunks = Math.max(1, Math.min(60, Number(body?.maxChunks) || 12));
  const dryRun = Boolean(body?.dryRun);

  const pool = getPool();
  await pool.query(
    `create table if not exists sendings_metrics (
       customer_inn text not null,
       sending_number text not null,
       cargo_numbers jsonb not null default '[]'::jsonb,
       send_start_at timestamptz,
       first_ready_at timestamptz,
       in_transit_hours numeric(12, 2),
       first_seen_at timestamptz not null default now(),
       last_seen_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       primary key (customer_inn, sending_number)
     )`
  );

  let currentFrom = dateFrom;
  let chunksProcessed = 0;
  let sendingsTotal = 0;
  let perevozkiTotal = 0;
  let metricsBuilt = 0;
  let metricsUpserted = 0;
  const chunks: Array<{ from: string; to: string; sendings: number; perevozki: number; metrics: number; updated: number; error?: string }> = [];

  while (currentFrom <= dateTo && chunksProcessed < maxChunks) {
    const currentTo = minIso(addDays(currentFrom, chunkDays - 1), dateTo);
    try {
      const [perevozkiJson, sendingsJson] = await Promise.all([
        fetchServiceJson(`${PEREVOZKI_URL}?DateB=${currentFrom}&DateE=${currentTo}`, serviceLogin, servicePassword),
        fetchServiceJson(`${GETAPI_URL}?metod=Getotpravki&DateB=${currentFrom}&DateE=${currentTo}`, serviceLogin, servicePassword),
      ]);
      const perevozkiList = Array.isArray(perevozkiJson) ? perevozkiJson : extractArrayFromAnyPayload(perevozkiJson);
      const sendingsList = extractArrayFromAnyPayload(sendingsJson);
      const metricRows = buildSendingsMetrics(sendingsList as any[], perevozkiList as any[]);
      const updated = dryRun ? 0 : (await upsertSendingsMetrics(pool, metricRows)).updated;

      sendingsTotal += sendingsList.length;
      perevozkiTotal += perevozkiList.length;
      metricsBuilt += metricRows.length;
      metricsUpserted += updated;
      chunks.push({
        from: currentFrom,
        to: currentTo,
        sendings: sendingsList.length,
        perevozki: perevozkiList.length,
        metrics: metricRows.length,
        updated,
      });
    } catch (e: any) {
      logError(ctx, "admin_backfill_sendings_metrics_chunk_failed", e, { from: currentFrom, to: currentTo });
      chunks.push({
        from: currentFrom,
        to: currentTo,
        sendings: 0,
        perevozki: 0,
        metrics: 0,
        updated: 0,
        error: String(e?.message || e),
      });
    }
    chunksProcessed += 1;
    currentFrom = addDays(currentTo, 1);
  }

  return res.status(200).json({
    ok: true,
    dryRun,
    requested: { dateFrom, dateTo, chunkDays, maxChunks },
    processed: {
      chunks: chunksProcessed,
      sendingsTotal,
      perevozkiTotal,
      metricsBuilt,
      metricsUpserted,
    },
    nextDateFrom: currentFrom <= dateTo ? currentFrom : null,
    done: currentFrom > dateTo,
    chunks,
    request_id: ctx.requestId,
  });
}
