import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

type PvzItem = {
  ВладелецИНН?: string;
  ВладелецНаименование?: string;
  Ссылка?: string;
  Наименование?: string;
  КодДляПечати?: string;
  РегионНаименование?: string;
  ГородНаименование?: string;
  КонтактноеЛицо?: string;
  ОтправительПолучательНаименование?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cron/refresh-pvz-cache");
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
    const upstreamUrl = `${GETAPI_URL}?metod=GETPVZ`;
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

    let json: { Success?: boolean; Error?: string; ПВЗ?: PvzItem[] };
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
      const err = String(json.Error ?? "Success=false");
      return res.status(502).json({ error: err, upstream_url: upstreamUrl, request_id: ctx.requestId });
    }

    const items = Array.isArray(json?.ПВЗ) ? json.ПВЗ : [];
    const pool = getPool();
    await pool.query("DELETE FROM cache_pvz");
    for (let i = 0; i < items.length; i++) {
      const p = items[i] as Record<string, unknown>;
      const ssylka = String(p?.Ссылка ?? "").trim();
      const naimenovanie = String(p?.Наименование ?? "").trim();
      const kod = String(p?.КодДляПечати ?? "").trim();
      const gorod = String(p?.ГородНаименование ?? "").trim();
      const region = String(p?.РегионНаименование ?? "").trim();
      const vladelecInn = String(p?.ВладелецИНН ?? "").trim();
      const vladelecNaim = String(p?.ВладелецНаименование ?? "").trim();
      const otpravitel = String(p?.ОтправительПолучательНаименование ?? "").trim();
      const kontakt = String(p?.КонтактноеЛицо ?? "").trim();
      await pool.query(
        `INSERT INTO cache_pvz (
          ssylka, naimenovanie, kod_dlya_pechati, gorod, region,
          vladelec_inn, vladelec_naimenovanie, otpravitel_poluchatel, kontaktnoe_litso,
          data, sort_order, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
        [ssylka, naimenovanie, kod, gorod, region, vladelecInn, vladelecNaim, otpravitel, kontakt, JSON.stringify(p), i]
      );
    }

    logInfo(ctx, "cron_refresh_pvz_done", { pvz_count: items.length });
    return res.status(200).json({
      ok: true,
      pvz_count: items.length,
      refreshed_at: new Date().toISOString(),
      upstream_url: upstreamUrl,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const message = (e as Error)?.message || String(e);
    logError(ctx, "cron_refresh_pvz_failed", e);
    return res.status(500).json({
      error: "Ошибка обновления кэша ПВЗ",
      details: message,
      request_id: ctx.requestId,
    });
  }
}
