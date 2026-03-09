import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { normalizeSverki } from "../../lib/sverkiParser.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cron/refresh-sverki-cache");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    logInfo(ctx, "cron_auth_failed", { status: cronAuthError.status });
    return res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
  }

  try {
    const upstreamUrl = `${GETAPI_URL}?metod=GETsverki`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Auth: AUTH_HEADER,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `HTTP ${upstream.status}`,
        details: text.slice(0, 300),
        upstream_url: upstreamUrl,
        request_id: ctx.requestId,
      });
    }

    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({
        error: "Ответ не JSON",
        details: text.slice(0, 300),
        upstream_url: upstreamUrl,
        request_id: ctx.requestId,
      });
    }
    if (json && typeof json === "object" && json.Success === false) {
      const err = String(json.Error ?? json.error ?? json.message ?? "Success=false");
      return res.status(502).json({ error: err, upstream_url: upstreamUrl, request_id: ctx.requestId });
    }

    const rows = normalizeSverki(json);
    const pool = getPool();
    await pool.query("DELETE FROM cache_sverki");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await pool.query(
        `INSERT INTO cache_sverki (
          doc_number, doc_date, period_from, period_to, customer_name, customer_inn, data, sort_order, fetched_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          r.docNumber || "",
          r.docDate,
          r.periodFrom,
          r.periodTo,
          r.customerName || "",
          r.customerInn || "",
          JSON.stringify(r.data),
          i,
        ]
      );
    }

    const payload = {
      ok: true,
      sverki_count: rows.length,
      refreshed_at: new Date().toISOString(),
      upstream_url: upstreamUrl,
      request_id: ctx.requestId,
    };
    logInfo(ctx, "cron_refresh_sverki_done", { sverki_count: rows.length });
    return res.status(200).json(payload);
  } catch (e: any) {
    const message = e?.message || String(e);
    logError(ctx, "cron_refresh_sverki_failed", e);
    return res.status(500).json({ error: "Ошибка обновления кэша актов сверки", details: message, request_id: ctx.requestId });
  }
}
