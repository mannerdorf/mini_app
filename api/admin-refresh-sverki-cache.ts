import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { normalizeSverki } from "../lib/sverkiParser.js";
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

  const upstreamUrl = `${GETAPI_URL}?metod=GETsverki`;

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
      });
    }

    if (upstreamJson && typeof upstreamJson === "object" && (upstreamJson as any).Success === false) {
      const err = String((upstreamJson as any).Error ?? (upstreamJson as any).error ?? (upstreamJson as any).message ?? "Success=false");
      return res.status(502).json({
        error: err,
        upstream_url: upstreamUrl,
      });
    }

    const rows = normalizeSverki(upstreamJson);
    if (rows.length === 0) {
      return res.status(502).json({
        error: "1С вернул пустой список актов сверок — кэш не перезаписан",
        upstream_url: upstreamUrl,
      });
    }

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

    return res.status(200).json({
      ok: true,
      sverki_count: rows.length,
      refreshed_at: new Date().toISOString(),
      message: "Справочник актов сверок обновлён",
      upstream_url: upstreamUrl,
    });
  } catch (e: any) {
    const msg = e?.message || "Ошибка вызова обновления актов сверок";
    return res.status(500).json({ error: msg, upstream_url: upstreamUrl });
  }
}
