import { normalizeCacheCustomers, replaceCustomerCache } from "../lib/customerCacheSync.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";
import { initRequestContext, logError, logInfo } from "./_lib/observability.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function parseBody(req: VercelRequest): { dryRun?: boolean } {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return { dryRun: (body as { dryRun?: boolean }).dryRun === true };
}

function extractPayload(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const o = data as Record<string, unknown>;
  return o.Customers ?? o.customers ?? o.items ?? o.Items ?? o.data ?? o.Data ?? o.result ?? o.Result ?? data;
}

/**
 * POST /api/admin-refresh-customers-cache
 * GETAPI?metod=Getcustomers — обновление cache_customers (как крон) или dry-run без записи в БД.
 * Только суперадмин.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-refresh-customers-cache");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина", request_id: ctx.requestId });
  }

  const { dryRun } = parseBody(req);
  const login = process.env.PEREVOZKI_SERVICE_LOGIN || process.env.HAULZ_1C_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD || process.env.HAULZ_1C_SERVICE_PASSWORD;
  if (!login || !password) {
    return res.status(503).json({
      error: "Не заданы PEREVOZKI_SERVICE_LOGIN/PASSWORD или HAULZ_1C_SERVICE_LOGIN/PASSWORD",
      request_id: ctx.requestId,
    });
  }

  const upstreamUrl = `${GETAPI_URL}?metod=Getcustomers`;
  const upstreamCurl = `curl --location '${upstreamUrl}' \\\n  -H 'Authorization: ${SERVICE_AUTH}' \\\n  -H 'Auth: Basic ${login}:<password>'`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const upstreamText = await upstreamRes.text().catch(() => "");

    if (!upstreamRes.ok) {
      return res.status(502).json({
        error: `Ошибка 1С: HTTP ${upstreamRes.status}`,
        details: upstreamText.slice(0, 2000),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
        upstream_status: upstreamRes.status,
        upstream_raw: upstreamText.slice(0, 8000),
        dry_run: dryRun,
        request_id: ctx.requestId,
      });
    }

    let upstreamJson: unknown;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      return res.status(502).json({
        error: "Ответ 1С не JSON",
        details: upstreamText.slice(0, 500),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
        upstream_raw: upstreamText.slice(0, 8000),
        dry_run: dryRun,
        request_id: ctx.requestId,
      });
    }

    if (upstreamJson && typeof upstreamJson === "object" && (upstreamJson as { Success?: boolean }).Success === false) {
      const err = String(
        (upstreamJson as { Error?: unknown; error?: unknown; message?: unknown }).Error ??
          (upstreamJson as { error?: unknown }).error ??
          (upstreamJson as { message?: unknown }).message ??
          "Success=false",
      );
      return res.status(502).json({
        error: err,
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
        upstream_json: upstreamJson,
        dry_run: dryRun,
        request_id: ctx.requestId,
      });
    }

    const payload = extractPayload(upstreamJson);
    const rows = normalizeCacheCustomers(payload);

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dry_run: true,
        customers_count: rows.length,
        sample: rows.slice(0, 5),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
        upstream_json: upstreamJson,
        message: `Getcustomers: ${rows.length} записей (кэш не изменён)`,
        request_id: ctx.requestId,
      });
    }

    if (rows.length === 0) {
      return res.status(502).json({
        error: "1С вернул пустой список заказчиков — кэш не перезаписан",
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
        upstream_json: upstreamJson,
        request_id: ctx.requestId,
      });
    }

    const pool = getPool();
    await replaceCustomerCache(pool, rows);

    logInfo(ctx, "admin_refresh_customers_done", { customers_count: rows.length });
    return res.status(200).json({
      ok: true,
      dry_run: false,
      customers_count: rows.length,
      refreshed_at: new Date().toISOString(),
      message: "Справочник заказчиков обновлён",
      upstream_url: upstreamUrl,
      upstream_curl: upstreamCurl,
      upstream_json: upstreamJson,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(ctx, "admin_refresh_customers_cache_failed", e, { message: msg });
    return res.status(500).json({
      error: "Ошибка при вызове Getcustomers",
      details: msg,
      upstream_url: upstreamUrl,
      upstream_curl: upstreamCurl,
      dry_run: dryRun,
      request_id: ctx.requestId,
    });
  }
}
