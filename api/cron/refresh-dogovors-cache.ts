import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { normalizeDogovors } from "../../lib/dogovorsParser.js";
import { requireCronAuth } from "../_lib/cronAuth.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    return res.status(cronAuthError.status).json({ error: cronAuthError.error });
  }

  try {
    const upstreamUrl = `${GETAPI_URL}?metod=GETdogovors`;
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
      });
    }
    if (json && typeof json === "object" && json.Success === false) {
      const err = String(json.Error ?? json.error ?? json.message ?? "Success=false");
      return res.status(502).json({ error: err, upstream_url: upstreamUrl });
    }

    const rows = normalizeDogovors(json);
    const pool = getPool();
    await pool.query("DELETE FROM cache_dogovors");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await pool.query(
        `INSERT INTO cache_dogovors (
          doc_number, doc_date, customer_name, customer_inn, title, data, sort_order, fetched_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [r.docNumber || "", r.docDate, r.customerName || "", r.customerInn || "", r.title || "", JSON.stringify(r.data), i]
      );
    }

    return res.status(200).json({
      ok: true,
      dogovors_count: rows.length,
      refreshed_at: new Date().toISOString(),
      upstream_url: upstreamUrl,
    });
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error("refresh-dogovors-cache error:", message);
    return res.status(500).json({ error: "Ошибка обновления кэша договоров", details: message });
  }
}
