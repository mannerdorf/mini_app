import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { buildSendingsMetrics, extractArrayFromAnyPayload, upsertSendingsMetrics } from "../../lib/sendingsMetrics.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const HTTP_TIMEOUT_MS = 110_000;
const RUNTIME_BUDGET_MS = 260_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Auth: `Basic ${login}:${password}`,
      Authorization: SERVICE_AUTH,
    },
    signal: controller.signal,
  });
  try {
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
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const querySecret = typeof req.query.secret === "string" ? req.query.secret : "";
  const provided = bearer || querySecret;
  if (secret && provided !== secret) {
    return res.status(401).json({ error: "Нет доступа" });
  }

  const enabled = String(process.env.SENDINGS_BACKFILL_ENABLED || "").trim().toLowerCase();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
    return res.status(200).json({ ok: true, skipped: true, reason: "SENDINGS_BACKFILL_ENABLED is off" });
  }

  const serviceLogin = String(process.env.PEREVOZKI_SERVICE_LOGIN || "").trim();
  const servicePassword = String(process.env.PEREVOZKI_SERVICE_PASSWORD || "").trim();
  if (!serviceLogin || !servicePassword) {
    return res.status(503).json({ error: "Не заданы PEREVOZKI_SERVICE_LOGIN / PEREVOZKI_SERVICE_PASSWORD" });
  }

  const today = new Date().toISOString().split("T")[0];
  const cfgFrom = toIsoDate(process.env.SENDINGS_BACKFILL_FROM || "") || "2023-01-01";
  const cfgTo = toIsoDate(process.env.SENDINGS_BACKFILL_TO || "") || today;
  const chunkDays = Math.max(1, Math.min(90, Number(process.env.SENDINGS_BACKFILL_CHUNK_DAYS) || 14));
  const maxChunks = Math.max(1, Math.min(24, Number(process.env.SENDINGS_BACKFILL_MAX_CHUNKS_PER_RUN) || 1));
  if (cfgFrom > cfgTo) {
    return res.status(400).json({ error: "SENDINGS_BACKFILL_FROM > SENDINGS_BACKFILL_TO" });
  }

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
  await pool.query(
    `create table if not exists sendings_backfill_state (
       id int primary key default 1 check (id = 1),
       current_from date not null,
       date_to date not null,
       done boolean not null default false,
       updated_at timestamptz not null default now()
     )`
  );
  await pool.query(
    `insert into sendings_backfill_state (id, current_from, date_to, done, updated_at)
     values (1, $1::date, $2::date, false, now())
     on conflict (id) do nothing`,
    [cfgFrom, cfgTo]
  );

  const stateRes = await pool.query<{ current_from: string; date_to: string; done: boolean }>(
    `select current_from::text, date_to::text, done from sendings_backfill_state where id = 1`
  );
  if (!stateRes.rows.length) {
    return res.status(500).json({ error: "Не удалось загрузить sendings_backfill_state" });
  }

  let currentFrom = toIsoDate(stateRes.rows[0].current_from) || cfgFrom;
  const dateTo = toIsoDate(stateRes.rows[0].date_to) || cfgTo;
  const alreadyDone = Boolean(stateRes.rows[0].done);
  if (alreadyDone || currentFrom > dateTo) {
    await pool.query(`update sendings_backfill_state set done = true, updated_at = now() where id = 1`);
    return res.status(200).json({ ok: true, done: true, currentFrom, dateTo, processedChunks: 0 });
  }

  let chunksProcessed = 0;
  let sendingsTotal = 0;
  let perevozkiTotal = 0;
  let metricsUpserted = 0;
  const chunks: Array<{ from: string; to: string; sendings: number; perevozki: number; updated: number; error?: string }> = [];

  while (currentFrom <= dateTo && chunksProcessed < maxChunks) {
    if (Date.now() - startedAt >= RUNTIME_BUDGET_MS) {
      break;
    }
    const currentTo = minIso(addDays(currentFrom, chunkDays - 1), dateTo);
    try {
      const [perevozkiJson, sendingsJson] = await Promise.all([
        fetchServiceJson(`${PEREVOZKI_URL}?DateB=${currentFrom}&DateE=${currentTo}`, serviceLogin, servicePassword),
        fetchServiceJson(`${GETAPI_URL}?metod=Getotpravki&DateB=${currentFrom}&DateE=${currentTo}`, serviceLogin, servicePassword),
      ]);
      const perevozkiList = Array.isArray(perevozkiJson) ? perevozkiJson : extractArrayFromAnyPayload(perevozkiJson);
      const sendingsList = extractArrayFromAnyPayload(sendingsJson);
      const metricRows = buildSendingsMetrics(sendingsList as any[], perevozkiList as any[]);
      const updated = (await upsertSendingsMetrics(pool, metricRows)).updated;
      sendingsTotal += sendingsList.length;
      perevozkiTotal += perevozkiList.length;
      metricsUpserted += updated;
      chunks.push({ from: currentFrom, to: currentTo, sendings: sendingsList.length, perevozki: perevozkiList.length, updated });
    } catch (e: any) {
      chunks.push({
        from: currentFrom,
        to: currentTo,
        sendings: 0,
        perevozki: 0,
        updated: 0,
        error: String(e?.message || e),
      });
    }
    chunksProcessed += 1;
    currentFrom = addDays(currentTo, 1);
  }

  const done = currentFrom > dateTo;
  await pool.query(
    `update sendings_backfill_state
       set current_from = $1::date,
           date_to = $2::date,
           done = $3,
           updated_at = now()
     where id = 1`,
    [done ? dateTo : currentFrom, dateTo, done]
  );

  return res.status(200).json({
    ok: true,
    done,
    nextDateFrom: done ? null : currentFrom,
    dateTo,
    processedChunks: chunksProcessed,
    sendingsTotal,
    perevozkiTotal,
    metricsUpserted,
    chunks,
  });
}
