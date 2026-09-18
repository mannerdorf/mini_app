import { runCronWork, cronDateWindow } from "../../lib/cronWorkState.js";
import { addDaysIso } from "../../lib/documentCacheRefreshCore.js";
import { writeOrdersSyncTrace, safeOrdersSyncError } from "../../lib/ordersSyncDiagnostics.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";
import {
  ensureDocumentCacheTables,
  fetchServiceJson,
  refreshDatedKindForWindow,
  ROTATING_DOCUMENT_KINDS,
  type DatedDocumentCacheKind,
  type DocumentCacheKind,
} from "../../lib/documentCacheRefreshCore.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";

function getStringQuery(req: VercelRequest, key: string): string {
  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
}

function extractCustomerArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const from = o.Items ?? o.items ?? o.Customers ?? o.customers ?? o.Data ?? o.data ?? o.Result ?? o.result ?? o.Rows ?? o.rows;
  if (Array.isArray(from)) return from;
  if (o.INN != null || o.Inn != null || o.inn != null) return [o];
  return Object.values(o).filter((v) => v && typeof v === "object") as any[];
}

function getStr(el: any, ...keys: string[]): string {
  if (!el || typeof el !== "object") return "";
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

function normalizeCacheCustomers(raw: unknown): { inn: string; customer_name: string; email: string }[] {
  const byInn = new Map<string, { inn: string; customer_name: string; email: string }>();
  for (const el of extractCustomerArray(raw)) {
    let inn = getStr(el, "Inn", "INN", "inn", "ИНН", "Code", "code", "Код");
    inn = inn.replace(/\D/g, "") || inn.trim();
    if (!inn || (inn.length !== 10 && inn.length !== 12)) continue;
    const customer_name =
      getStr(el, "Name", "name", "Customer", "customer", "Contragent", "contragent", "Client", "client", "Заказчик", "Наименование") || inn;
    const email = getStr(el, "Email", "email", "E-mail", "e-mail", "Почта", "Mail");
    byInn.set(inn, { inn, customer_name, email });
  }
  return Array.from(byInn.values());
}

async function refreshCustomers(pool: ReturnType<typeof getPool>, login: string, password: string): Promise<{ count: number }> {
  const json = await fetchServiceJson(login, password, `${GETAPI_URL}?metod=Getcustomers`);
  const rows = normalizeCacheCustomers(json);
  await pool.query("delete from cache_customers");
  if (rows.length > 0) {
    await pool.query(
      `insert into cache_customers (inn, customer_name, email, fetched_at)
       select inn, customer_name, email, now()
       from unnest($1::text[], $2::text[], $3::text[]) as t(inn, customer_name, email)
       on conflict (inn) do update set customer_name = excluded.customer_name, email = excluded.email, fetched_at = now()`,
      [rows.map((r) => r.inn), rows.map((r) => r.customer_name), rows.map((r) => r.email)],
    );
  }
  return { count: rows.length };
}

function ensureCronAuth(req: VercelRequest, res: VercelResponse, route: string) {
  const ctx = initRequestContext(req, res, route);
  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    logInfo(ctx, "cron_auth_failed", { status: cronAuthError.status });
    res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
    return { ok: false as const, ctx };
  }
  return { ok: true as const, ctx };
}

function getServiceCredentials(): { login: string; password: string } | null {
  const login = process.env.PEREVOZKI_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD;
  return login && password ? { login, password } : null;
}

/** Работа раз в 25 минут, окно 3 дня, тип хранится в БД. */
export async function handleRefreshCacheRecent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    return res.status(200).json(await runCronWork(pool,"documents_recent",25,async cursor => {
    const kinds: DocumentCacheKind[] = [...ROTATING_DOCUMENT_KINDS,"customers"];
    const position = Number.isInteger(cursor.position) ? cursor.position % kinds.length : 0;
    const kind = kinds[position];
    const { dateFrom, dateTo } = cronDateWindow(3);

    const result =
      kind === "customers"
        ? {
            kind: "customers" as const,
            mode: "recent" as const,
            dateFrom,
            dateTo,
            chunkCountRows: 0,
            cacheCount: (await refreshCustomers(pool, credentials.login, credentials.password)).count,
          }
        : await refreshDatedKindForWindow(
            pool,
            credentials.login,
            credentials.password,
            kind as DatedDocumentCacheKind,
            dateFrom,
            dateTo,
            "recent",
          );

    return {result:{ok:true,mode:"recent",windowDays:3,result,request_id:auth.ctx.requestId},cursor:{position:(position+1)%kinds.length}};
    }));
  } catch (e: any) {
    logError(auth.ctx, "refresh_cache_recent_failed", e);
    return res.status(500).json({ error: "Ошибка обновления кэша (recent)", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

/** Ежедневно: последние 10 дней, четыре типа последовательно. */
export async function handleRefreshCacheDeep(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-cache-deep");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    return res.status(200).json(await runCronWork(pool,"documents_deep",0,async cursor => {
      const {dateFrom,dateTo}=cronDateWindow(10);
      const results=[];
      const start = cursor.day===dateTo ? Number(cursor.position || 0) : 0;
      for(let i=start;i<ROTATING_DOCUMENT_KINDS.length;i++) {
        const result=await refreshDatedKindForWindow(pool,credentials.login,credentials.password,ROTATING_DOCUMENT_KINDS[i],dateFrom,dateTo,"deep");
        results.push(result);
        await pool.query("UPDATE cron_work_state SET cursor=$2 WHERE name=$1",["documents_deep",JSON.stringify({day:dateTo,position:i+1})]);
      }
      return {result:{ok:true,mode:"deep",windowDays:10,results,request_id:auth.ctx.requestId},cursor:{day:dateTo,position:ROTATING_DOCUMENT_KINDS.length}};
    }));
  } catch (e: any) {
    logError(auth.ctx, "refresh_cache_deep_failed", e);
    return res.status(500).json({ error: "Ошибка обновления кэша (deep)", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

/** @deprecated используйте handleRefreshCacheRecent */
export async function handleRefreshCacheChunk(req: VercelRequest, res: VercelResponse) {
  return handleRefreshCacheRecent(req, res);
}

export async function handleRefreshOrdersCacheChunk(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-orders-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    await writeOrdersSyncTrace(getPool(), auth.ctx.requestId, {status:"error",stage:"configuration",error:"Не настроены PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD на cron-сервере"}, true);
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    const guard = await pool.connect();
    let locked = false;
    try {
      locked = (await guard.query("SELECT pg_try_advisory_lock(114,2) AS locked")).rows[0]?.locked === true;
      if (!locked) return res.status(200).json({ok:true,skipped:true,reason:"refresh_in_progress"});
      const backfill=getStringQuery(req,"mode")==="backfill";
      const explicit=Boolean(getStringQuery(req,"dateFrom") || getStringQuery(req,"dateTo"));
      const task=backfill?"orders_history":"orders_recent";
      const execute=async (cursor:any):Promise<{result:Record<string,unknown>;cursor:any}> => {
      const defaults = cronDateWindow(3);
      const historyEnd=cursor.endDay || addDaysIso(defaults.dateFrom,-1);
      if(backfill) {
        defaults.dateFrom=cursor.nextDay || process.env.ORDERS_BACKFILL_FROM || `${defaults.dateTo.slice(0,4)}-01-01`;
        defaults.dateTo=defaults.dateFrom;
        if(defaults.dateFrom>historyEnd) return {result:{ok:true,done:true},cursor};
      }
      const dateFrom = getStringQuery(req,"dateFrom") || defaults.dateFrom;
      const dateTo = getStringQuery(req,"dateTo") || defaults.dateTo;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom>dateTo ||
          !Number.isFinite(Date.parse(dateFrom)) || !Number.isFinite(Date.parse(dateTo)) || Date.parse(dateTo)-Date.parse(dateFrom)>90*86400000) {
        throw new Error("Укажите период YYYY-MM-DD не более 90 дней");
      }
      await writeOrdersSyncTrace(pool, auth.ctx.requestId, {status:"running",stage:"start",dateFrom,dateTo}, true);
      const results=[];
      // Each day is committed independently. A failure preserves the previous successful days.
      for(let day=dateFrom;day<=dateTo;day=addDaysIso(day,1)) {
        const result = await refreshDatedKindForWindow(pool, credentials.login, credentials.password, "orders", day, day, "chunk", {
          webPush:false,trace:patch=>writeOrdersSyncTrace(pool,auth.ctx.requestId,{...patch,currentDay:day}),
        });
        results.push(result);
      }
      await writeOrdersSyncTrace(pool,auth.ctx.requestId,{status:"success",stage:"complete",dateFrom,dateTo,receivedRows:results.reduce((sum,r)=>sum+r.chunkCountRows,0),savedRows:results.at(-1)?.cacheCount});
      return {result:{ok:true,mode:backfill?"orders_backfill":"orders",windowDays:3,results,request_id:auth.ctx.requestId},cursor:backfill?{nextDay:addDaysIso(dateTo,1),endDay:historyEnd}:{}};
      };
      if(explicit) {
        // Manual diagnostics is limited to three days per call to stay within server runtime.
        const from=getStringQuery(req,"dateFrom"),to=getStringQuery(req,"dateTo");
        if(!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from>to || Date.parse(to)-Date.parse(from)>2*86400000) return res.status(400).json({error:"Для ручной загрузки укажите от 1 до 3 дней"});
        return res.status(200).json((await execute({})).result);
      }
      return res.status(200).json(await runCronWork(pool,task,backfill?0:55,execute));
    } finally {
      try { if (locked) await guard.query("SELECT pg_advisory_unlock(114,2)"); } finally { guard.release(); }
    }
  } catch (e: any) {
    await writeOrdersSyncTrace(getPool(), auth.ctx.requestId, {status:"error",error:safeOrdersSyncError(e)});
    logError(auth.ctx, "refresh_orders_cache_failed", e);
    return res.status(500).json({ error: "Ошибка обновления chunk-кэша заявок", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}
