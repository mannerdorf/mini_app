import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { normalizeDogovors } from "../lib/dogovorsParser.js";
import { getPool } from "./_db.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const AUTH_HEADER = "Basic Info@haulz.pro:Y2ME42XyI_";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const upstreamUrl = `${GETAPI_URL}?metod=GETdogovors`;
  const upstreamCurl = `curl --location '${upstreamUrl}' --header 'Auth: ${AUTH_HEADER}' --header 'Authorization: ${SERVICE_AUTH}'`;

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
        upstream_response: upstreamText.slice(0, 4000),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }

    let upstreamJson: unknown;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      return res.status(502).json({
        error: "Ответ 1С не JSON",
        details: upstreamText.slice(0, 500),
        upstream_response: upstreamText.slice(0, 4000),
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }

    if (upstreamJson && typeof upstreamJson === "object" && (upstreamJson as any).Success === false) {
      const err = String((upstreamJson as any).Error ?? (upstreamJson as any).error ?? (upstreamJson as any).message ?? "Success=false");
      return res.status(502).json({
        error: err,
        upstream_response: upstreamJson,
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }

    const rows = normalizeDogovors(upstreamJson);
    if (rows.length === 0) {
      return res.status(502).json({
        error: "1С вернул пустой список договоров — кэш не перезаписан",
        upstream_response: upstreamJson,
        upstream_url: upstreamUrl,
        upstream_curl: upstreamCurl,
      });
    }

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
      message: "Справочник договоров обновлён",
      upstream_response: upstreamJson,
      upstream_url: upstreamUrl,
      upstream_curl: upstreamCurl,
    });
  } catch (e: any) {
    const msg = e?.message || "Ошибка вызова обновления договоров";
    return res.status(500).json({ error: msg, upstream_url: upstreamUrl, upstream_curl: upstreamCurl });
  }
}
