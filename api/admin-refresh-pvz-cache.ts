import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";
import { initRequestContext, logError, logInfo } from "./_lib/observability.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

type PvzItem = Record<string, unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-refresh-pvz-cache");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as { admin?: boolean })?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const upstreamUrl = `${GETAPI_URL}?metod=GETPVZ`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Auth: AUTH_HEADER,
        Authorization: SERVICE_AUTH,
      },
    });
    const upstreamText = await upstreamRes.text().catch(() => "");
    if (!upstreamRes.ok) {
      return res.status(502).json({
        error: `Ошибка 1С: HTTP ${upstreamRes.status}`,
        details: upstreamText.slice(0, 500),
        upstream_url: upstreamUrl,
        request_id: ctx.requestId,
      });
    }

    let upstreamJson: { Success?: boolean; Error?: string; ПВЗ?: PvzItem[] };
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      return res.status(502).json({
        error: "Ответ 1С не JSON",
        details: upstreamText.slice(0, 500),
        upstream_url: upstreamUrl,
        request_id: ctx.requestId,
      });
    }

    if (upstreamJson && typeof upstreamJson === "object" && upstreamJson.Success === false) {
      const err = String(upstreamJson.Error ?? "Success=false");
      return res.status(502).json({
        error: err,
        upstream_url: upstreamUrl,
        request_id: ctx.requestId,
      });
    }

    const items = Array.isArray(upstreamJson?.ПВЗ) ? upstreamJson.ПВЗ : [];
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

    logInfo(ctx, "admin_refresh_pvz_done", { pvz_count: items.length });
    return res.status(200).json({
      ok: true,
      pvz_count: items.length,
      refreshed_at: new Date().toISOString(),
      message: "Справочник ПВЗ обновлён",
      upstream_url: upstreamUrl,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || "Ошибка вызова обновления справочника ПВЗ";
    logError(ctx, "admin_refresh_pvz_failed", e);
    return res.status(500).json({ error: msg, upstream_url: upstreamUrl, request_id: ctx.requestId });
  }
}
