import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { normalizeTariffs } from "../../lib/tariffsParser.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const TARIFS_AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  try {
    const upstreamUrl = `${GETAPI_URL}?metod=GETTarifs`;
    const upstreamCurl = `curl --location '${upstreamUrl}' --header 'Auth: ${TARIFS_AUTH_HEADER}' --header 'Authorization: ${SERVICE_AUTH}'`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Auth: TARIFS_AUTH_HEADER,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `HTTP ${upstream.status}`,
        details: text.slice(0, 200),
        upstream_response: text.slice(0, 4000),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }

    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return res.status(502).json({
        error: "Ответ не JSON",
        details: text.slice(0, 200),
        upstream_response: text.slice(0, 4000),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }
    if (json && typeof json === "object" && json.Success === false) {
      const err = String(json.Error ?? json.error ?? json.message ?? "Success=false");
      return res.status(502).json({ error: err, upstream_response: json, upstream_url: upstreamUrl, upstream_curl: upstreamCurl });
    }

    const rows = normalizeTariffs(json);
    const pool = getPool();
    await pool.query("DELETE FROM cache_tariffs");
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        await pool.query(
          `INSERT INTO cache_tariffs (
            doc_date, doc_number, customer_name, customer_inn, city_from, city_to,
            transport_type, is_dangerous, is_vet, tariff, data, sort_order, fetched_at
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
          [
            r.docDate,
            r.docNumber || "",
            r.customerName || "",
            r.customerInn || "",
            r.cityFrom || "",
            r.cityTo || "",
            r.transportType || "",
            r.dangerous,
            r.vet,
            r.tariff,
            JSON.stringify(r.data),
            i,
          ]
        );
      }
    }

    return res.status(200).json({
      ok: true,
      tariffs_count: rows.length,
      refreshed_at: new Date().toISOString(),
      upstream_response: json,
      upstream_url: upstreamUrl,
      upstream_curl: upstreamCurl,
    });
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error("refresh-tariffs-cache error:", message);
    return res.status(500).json({ error: "Ошибка обновления кэша тарифов", details: message });
  }
}
