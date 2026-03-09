import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { buildSendingsMetrics, extractArrayFromAnyPayload, upsertSendingsMetrics } from "../../lib/sendingsMetrics.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const HTTP_TIMEOUT_MS = 110_000;
const RUNTIME_BUDGET_MS = 260_000;
const DEFAULT_CHUNK_DAYS = 7;
const DEFAULT_MAX_CHUNKS = 1;
const DEFAULT_CARGO_BATCH_SIZE = 100;

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

function normalizeCargoNumber(value: unknown): string {
  return String(value ?? "").replace(/^0000-/, "").trim().replace(/^0+/, "");
}

function toDateOnly(value: unknown): string {
  const d = new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickCargoNumber(item: any): string {
  return normalizeCargoNumber(
    item?.Number ?? item?.number ?? item?.НомерПеревозки ?? item?.CargoNumber ?? item?.NumberPerevozki ?? item?.ИДОтправления
  );
}

function pickCargoStatus(item: any): string {
  return String(item?.State ?? item?.state ?? item?.Статус ?? item?.Status ?? item?.StatusName ?? "")
    .trim()
    .toLowerCase();
}

function pickCargoStatusDate(item: any): Date | null {
  const source =
    item?.StatusDate ??
    item?.DateStatus ??
    item?.DateState ??
    item?.UpdatedAt ??
    item?.updated_at ??
    item?.ДатаСтатуса ??
    item?.ДатаИзменения ??
    item?.DateVr ??
    item?.DatePrih ??
    item?.DateDelivery ??
    item?.DeliveryDate ??
    item?.ДатаДоставки;
  return asDate(source);
}

function isReadyLikeStatus(status: string): boolean {
  if (!status) return false;
  return (status.includes("готов") && status.includes("выдач")) || status.includes("ready") || status.includes("достав");
}

async function loadCacheList(pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }, tableName: string) {
  const safeName = tableName.replace(/[^a-z0-9_]/gi, "");
  const row = await pool.query(`select data from ${safeName} where id = 1`);
  if (!row.rows.length) return [];
  const data = row.rows[0]?.data;
  return Array.isArray(data) ? data : extractArrayFromAnyPayload(data);
}

async function ensureTables(pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }) {
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
    `create table if not exists sendings_30d_queue (
       customer_inn text not null,
       sending_number text not null,
       send_start_at timestamptz,
       cargo_numbers jsonb not null default '[]'::jsonb,
       first_ready_at timestamptz,
       state text not null default 'pending',
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       primary key (customer_inn, sending_number)
     )`
  );
  await pool.query(`create index if not exists sendings_30d_queue_state_idx on sendings_30d_queue(state)`);
  await pool.query(`create index if not exists sendings_30d_queue_updated_at_idx on sendings_30d_queue(updated_at desc)`);
  await pool.query(
    `create table if not exists sendings_30d_cargo_queue (
       cargo_number text primary key,
       customer_inn text not null,
       sending_number text not null,
       ready_at timestamptz,
       last_status text,
       last_status_at timestamptz,
       poll_attempts int not null default 0,
       done boolean not null default false,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     )`
  );
  await pool.query(
    `create index if not exists sendings_30d_cargo_queue_done_idx on sendings_30d_cargo_queue(done, updated_at)`
  );
  await pool.query(
    `create index if not exists sendings_30d_cargo_queue_send_idx on sendings_30d_cargo_queue(customer_inn, sending_number)`
  );
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
  const ctx = initRequestContext(req, res, "cron/backfill-sendings-metrics");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    logInfo(ctx, "cron_auth_failed", { status: cronAuthError.status });
    return res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
  }

  const enabled = String(process.env.SENDINGS_BACKFILL_ENABLED || "").trim().toLowerCase();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
    return res.status(200).json({ ok: true, skipped: true, reason: "SENDINGS_BACKFILL_ENABLED is off", request_id: ctx.requestId });
  }

  const serviceLogin = String(process.env.PEREVOZKI_SERVICE_LOGIN || "").trim();
  const servicePassword = String(process.env.PEREVOZKI_SERVICE_PASSWORD || "").trim();
  if (!serviceLogin || !servicePassword) {
    return res.status(503).json({ error: "Не заданы PEREVOZKI_SERVICE_LOGIN / PEREVOZKI_SERVICE_PASSWORD", request_id: ctx.requestId });
  }

  const today = new Date().toISOString().split("T")[0];
  const cfgFrom = toIsoDate(process.env.SENDINGS_BACKFILL_FROM || "") || "2023-01-01";
  const cfgTo = toIsoDate(process.env.SENDINGS_BACKFILL_TO || "") || today;
  const chunkDays = Math.max(1, Math.min(90, Number(process.env.SENDINGS_BACKFILL_CHUNK_DAYS) || DEFAULT_CHUNK_DAYS));
  const maxChunks = Math.max(1, Math.min(24, Number(process.env.SENDINGS_BACKFILL_MAX_CHUNKS_PER_RUN) || DEFAULT_MAX_CHUNKS));
  const cargoBatchSize = Math.max(
    10,
    Math.min(500, Number(process.env.SENDINGS_BACKFILL_CARGO_BATCH_SIZE) || DEFAULT_CARGO_BATCH_SIZE)
  );
  if (cfgFrom > cfgTo) {
    return res.status(400).json({ error: "SENDINGS_BACKFILL_FROM > SENDINGS_BACKFILL_TO", request_id: ctx.requestId });
  }

  const pool = getPool();
  await ensureTables(pool);
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
    return res.status(500).json({ error: "Не удалось загрузить sendings_backfill_state", request_id: ctx.requestId });
  }

  let currentFrom = toIsoDate(stateRes.rows[0].current_from) || cfgFrom;
  const dateTo = toIsoDate(stateRes.rows[0].date_to) || cfgTo;
  const alreadyDone = Boolean(stateRes.rows[0].done);
  if (alreadyDone || currentFrom > dateTo) {
    await pool.query(`update sendings_backfill_state set done = true, updated_at = now() where id = 1`);
    return res.status(200).json({ ok: true, done: true, currentFrom, dateTo, processedChunks: 0, request_id: ctx.requestId });
  }

  let chunksProcessed = 0;
  let sendingsSeededTotal = 0;
  let cargoQueuedTotal = 0;
  let cargoProcessedTotal = 0;
  let cargoMarkedReadyTotal = 0;
  let metricsUpserted = 0;
  const chunks: Array<{
    from: string;
    to: string;
    seededSendings: number;
    queuedCargo: number;
    cargoProcessed: number;
    cargoMarkedReady: number;
    updated: number;
    queueLeft: number;
    error?: string;
  }> = [];

  const cacheSendings = await loadCacheList(pool, "cache_sendings");
  const cachePerevozki = await loadCacheList(pool, "cache_perevozki");
  const allSeedRows = buildSendingsMetrics(cacheSendings as any[], cachePerevozki as any[]);

  while (currentFrom <= dateTo && chunksProcessed < maxChunks) {
    if (Date.now() - ctx.startedAt >= RUNTIME_BUDGET_MS) {
      break;
    }
    const currentTo = minIso(addDays(currentFrom, chunkDays - 1), dateTo);
    try {
      const seedRows = allSeedRows.filter((row) => {
        const start = row?.sendStartAt ? row.sendStartAt.toISOString().split("T")[0] : "";
        const ready = row?.firstReadyAt ? row.firstReadyAt.toISOString().split("T")[0] : "";
        if (!start && !ready) return false;
        if (start && start >= currentFrom && start <= currentTo) return true;
        if (ready && ready >= currentFrom && ready <= currentTo) return true;
        if (start && start <= currentTo && (!ready || ready >= currentFrom)) return true;
        return false;
      });
      let seededSendings = 0;
      for (const row of seedRows) {
        await pool.query(
          `insert into sendings_30d_queue (
             customer_inn, sending_number, send_start_at, cargo_numbers, first_ready_at, state, updated_at
           )
           values ($1, $2, $3::timestamptz, $4::jsonb, $5::timestamptz, 'pending', now())
           on conflict (customer_inn, sending_number) do update
             set send_start_at = case
                                  when sendings_30d_queue.send_start_at is null then excluded.send_start_at
                                  when excluded.send_start_at is null then sendings_30d_queue.send_start_at
                                  else least(sendings_30d_queue.send_start_at, excluded.send_start_at)
                                end,
                 cargo_numbers = (
                   select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                   from (
                     select jsonb_array_elements(coalesce(sendings_30d_queue.cargo_numbers, '[]'::jsonb)) as x
                     union all
                     select jsonb_array_elements(coalesce(excluded.cargo_numbers, '[]'::jsonb)) as x
                   ) z
                 ),
                 first_ready_at = case
                                    when sendings_30d_queue.first_ready_at is null then excluded.first_ready_at
                                    when excluded.first_ready_at is null then sendings_30d_queue.first_ready_at
                                    else least(sendings_30d_queue.first_ready_at, excluded.first_ready_at)
                                  end,
                 updated_at = now()`,
          [
            row.customerInn,
            row.sendingNumber,
            row.sendStartAt ? row.sendStartAt.toISOString() : null,
            JSON.stringify(Array.isArray(row.cargoNumbers) ? row.cargoNumbers : []),
            row.firstReadyAt ? row.firstReadyAt.toISOString() : null,
          ]
        );
        seededSendings += 1;
      }

      const metricSeedRes = await pool.query<{
        customer_inn: string;
        sending_number: string;
        cargo_numbers: unknown;
        send_start_at: unknown;
        first_ready_at: unknown;
      }>(
        `select customer_inn, sending_number, cargo_numbers, send_start_at, first_ready_at
           from sendings_metrics
          where
            (send_start_at::date between $1::date and $2::date)
            or (first_ready_at::date between $1::date and $2::date)
            or (
              send_start_at is not null
              and send_start_at::date <= $2::date
              and (first_ready_at is null or first_ready_at::date >= $1::date)
            )`,
        [currentFrom, currentTo]
      );
      for (const row of metricSeedRes.rows) {
        await pool.query(
          `insert into sendings_30d_queue (
             customer_inn, sending_number, send_start_at, cargo_numbers, first_ready_at, state, updated_at
           )
           values ($1, $2, $3::timestamptz, $4::jsonb, $5::timestamptz, 'pending', now())
           on conflict (customer_inn, sending_number) do update
             set send_start_at = case
                                  when sendings_30d_queue.send_start_at is null then excluded.send_start_at
                                  when excluded.send_start_at is null then sendings_30d_queue.send_start_at
                                  else least(sendings_30d_queue.send_start_at, excluded.send_start_at)
                                end,
                 cargo_numbers = (
                   select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                   from (
                     select jsonb_array_elements(coalesce(sendings_30d_queue.cargo_numbers, '[]'::jsonb)) as x
                     union all
                     select jsonb_array_elements(coalesce(excluded.cargo_numbers, '[]'::jsonb)) as x
                   ) z
                 ),
                 first_ready_at = case
                                    when sendings_30d_queue.first_ready_at is null then excluded.first_ready_at
                                    when excluded.first_ready_at is null then sendings_30d_queue.first_ready_at
                                    else least(sendings_30d_queue.first_ready_at, excluded.first_ready_at)
                                  end,
                 updated_at = now()`,
          [
            row.customer_inn,
            row.sending_number,
            row.send_start_at ? new Date(String(row.send_start_at)).toISOString() : null,
            JSON.stringify(Array.isArray(row.cargo_numbers) ? row.cargo_numbers : []),
            row.first_ready_at ? new Date(String(row.first_ready_at)).toISOString() : null,
          ]
        );
        seededSendings += 1;
      }

      const insertCargoRes = await pool.query<{ count: string }>(
        `with ins as (
           insert into sendings_30d_cargo_queue (cargo_number, customer_inn, sending_number, updated_at)
           select
             d.cargo_number,
             d.customer_inn,
             d.sending_number,
             now()
           from (
             select distinct on (trim(both '"' from c.value::text))
               trim(both '"' from c.value::text) as cargo_number,
               q.customer_inn,
               q.sending_number,
               q.send_start_at,
               q.updated_at
             from sendings_30d_queue q
             cross join lateral jsonb_array_elements(coalesce(q.cargo_numbers, '[]'::jsonb)) c
             where (
                     q.send_start_at::date between $1::date and $2::date
                     or q.first_ready_at::date between $1::date and $2::date
                     or (
                       q.send_start_at is not null
                       and q.send_start_at::date <= $2::date
                       and (q.first_ready_at is null or q.first_ready_at::date >= $1::date)
                     )
                   )
               and trim(both '"' from c.value::text) <> ''
             order by
               trim(both '"' from c.value::text),
               q.send_start_at desc nulls last,
               q.updated_at desc
           ) d
           on conflict (cargo_number) do update
             set customer_inn = excluded.customer_inn,
                 sending_number = excluded.sending_number,
                 updated_at = now()
           returning 1
         )
         select count(*)::text as count from ins`,
        [currentFrom, currentTo]
      );
      const queuedCargo = Number(insertCargoRes.rows[0]?.count || 0);

      const batchRows = await pool.query<{ cargo_number: string }>(
        `select cargo_number
           from sendings_30d_cargo_queue
          where done = false
          order by updated_at asc
          limit $1`,
        [cargoBatchSize]
      );
      const cargoBatch = batchRows.rows.map((r) => normalizeCargoNumber(r.cargo_number)).filter(Boolean);

      let cargoProcessed = 0;
      let cargoMarkedReady = 0;
      if (cargoBatch.length > 0) {
        const livePerevozkiJson = await fetchServiceJson(
          `${PEREVOZKI_URL}?DateB=${currentFrom}&DateE=${currentTo}`,
          serviceLogin,
          servicePassword
        );
        const livePerevozkiList = Array.isArray(livePerevozkiJson)
          ? livePerevozkiJson
          : extractArrayFromAnyPayload(livePerevozkiJson);

        const liveMap = new Map<string, { readyAt: Date | null; lastStatus: string; lastStatusAt: Date | null }>();
        for (const item of livePerevozkiList as any[]) {
          const cargoNumber = pickCargoNumber(item);
          if (!cargoNumber || !cargoBatch.includes(cargoNumber)) continue;
          const status = pickCargoStatus(item);
          const statusDate = pickCargoStatusDate(item);
          const isReady = isReadyLikeStatus(status);
          const prev = liveMap.get(cargoNumber);
          if (!prev) {
            liveMap.set(cargoNumber, {
              readyAt: isReady ? statusDate : null,
              lastStatus: status,
              lastStatusAt: statusDate,
            });
            continue;
          }
          if (statusDate && (!prev.lastStatusAt || statusDate.getTime() > prev.lastStatusAt.getTime())) {
            prev.lastStatusAt = statusDate;
            prev.lastStatus = status || prev.lastStatus;
          }
          if (isReady && statusDate && (!prev.readyAt || statusDate.getTime() < prev.readyAt.getTime())) {
            prev.readyAt = statusDate;
          }
          liveMap.set(cargoNumber, prev);
        }

        for (const cargoNumber of cargoBatch) {
          const info = liveMap.get(cargoNumber);
          const readyAt = info?.readyAt ?? null;
          const lastStatus = info?.lastStatus ?? null;
          const lastStatusAt = info?.lastStatusAt ?? null;
          if (readyAt) cargoMarkedReady += 1;
          cargoProcessed += 1;
          await pool.query(
            `update sendings_30d_cargo_queue
               set ready_at = coalesce(ready_at, $2::timestamptz),
                   last_status = coalesce($3::text, last_status),
                   last_status_at = coalesce($4::timestamptz, last_status_at),
                   done = case when coalesce(ready_at, $2::timestamptz) is not null then true else done end,
                   poll_attempts = poll_attempts + 1,
                   updated_at = now()
             where cargo_number = $1`,
            [
              cargoNumber,
              readyAt ? readyAt.toISOString() : null,
              lastStatus,
              lastStatusAt ? lastStatusAt.toISOString() : null,
            ]
          );
        }
      }

      await pool.query(
        `update sendings_30d_queue q
           set first_ready_at = case
                                  when q.first_ready_at is null then x.min_ready_at
                                  when x.min_ready_at is null then q.first_ready_at
                                  else least(q.first_ready_at, x.min_ready_at)
                                end,
               state = case when x.min_ready_at is not null then 'done' else q.state end,
               updated_at = now()
          from (
            select customer_inn, sending_number, min(ready_at) as min_ready_at
            from sendings_30d_cargo_queue
            where ready_at is not null
            group by customer_inn, sending_number
          ) x
         where q.customer_inn = x.customer_inn
           and q.sending_number = x.sending_number`
      );

      const metricSourceRes = await pool.query<{
        customer_inn: string;
        sending_number: string;
        cargo_numbers: unknown;
        send_start_at: unknown;
        first_ready_at: unknown;
      }>(
        `select customer_inn, sending_number, cargo_numbers, send_start_at, first_ready_at
           from sendings_30d_queue
          where
            (send_start_at::date between $1::date and $2::date)
            or (first_ready_at::date between $1::date and $2::date)
            or (
              send_start_at is not null
              and send_start_at::date <= $2::date
              and (first_ready_at is null or first_ready_at::date >= $1::date)
            )`,
        [currentFrom, currentTo]
      );
      const metricsRows = metricSourceRes.rows.map((row) => {
        const sendStartAt = asDate(row.send_start_at);
        const firstReadyAt = asDate(row.first_ready_at);
        const cargoNumbersRaw = Array.isArray(row.cargo_numbers) ? row.cargo_numbers : [];
        const cargoNumbers = cargoNumbersRaw.map((v) => normalizeCargoNumber(v)).filter(Boolean);
        return {
          customerInn: String(row.customer_inn || "").trim(),
          sendingNumber: String(row.sending_number || "").trim(),
          cargoNumbers,
          sendStartAt,
          firstReadyAt,
          inTransitHours: null as number | null,
        };
      });
      const updated = (await upsertSendingsMetrics(pool, metricsRows)).updated;
      metricsUpserted += updated;

      const leftRes = await pool.query<{ left_count: string }>(
        `select count(*)::text as left_count from sendings_30d_cargo_queue where done = false`
      );
      const queueLeft = Number(leftRes.rows[0]?.left_count || 0);

      sendingsSeededTotal += seededSendings;
      cargoQueuedTotal += queuedCargo;
      cargoProcessedTotal += cargoProcessed;
      cargoMarkedReadyTotal += cargoMarkedReady;

      chunks.push({
        from: currentFrom,
        to: currentTo,
        seededSendings,
        queuedCargo,
        cargoProcessed,
        cargoMarkedReady,
        updated,
        queueLeft,
      });
    } catch (e: any) {
      logError(ctx, "backfill_chunk_failed", e, { chunk_from: currentFrom, chunk_to: currentTo });
      chunks.push({
        from: currentFrom,
        to: currentTo,
        seededSendings: 0,
        queuedCargo: 0,
        cargoProcessed: 0,
        cargoMarkedReady: 0,
        updated: 0,
        queueLeft: 0,
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

  logInfo(ctx, "backfill_sendings_metrics_done", {
    done,
    processed_chunks: chunksProcessed,
    metrics_upserted: metricsUpserted,
  });
  return res.status(200).json({
    ok: true,
    done,
    nextDateFrom: done ? null : currentFrom,
    dateTo,
    processedChunks: chunksProcessed,
    sendingsSeededTotal,
    cargoQueuedTotal,
    cargoProcessedTotal,
    cargoMarkedReadyTotal,
    cargoBatchSize,
    metricsUpserted,
    chunks,
    request_id: ctx.requestId,
  });
}
