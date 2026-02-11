import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

/** Кэш считается свежим 15 минут */
const CACHE_FRESH_MINUTES = 15;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (secret && bearer !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const login = process.env.PEREVOZKI_SERVICE_LOGIN || process.env.HAULZ_1C_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD || process.env.HAULZ_1C_SERVICE_PASSWORD;
  if (!login || !password) {
    return res.status(500).json({ error: "PEREVOZKI_SERVICE_LOGIN and PEREVOZKI_SERVICE_PASSWORD (or HAULZ_1C_*) must be set" });
  }

  const dateTo = new Date().toISOString().split("T")[0];
  const dateFrom = "2020-01-01";

  let pool;
  try {
    pool = getPool();
  } catch (e: any) {
    return res.status(500).json({ error: "Database unavailable", details: e?.message });
  }

  try {
    // 1) Запрос перевозок за весь период (без INN — все данные сервисного аккаунта)
    const perevozkiUrl = `${PEREVOZKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    const perevozkiRes = await fetch(perevozkiUrl, {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const perevozkiText = await perevozkiRes.text();
    let perevozkiList: unknown[] = [];
    if (perevozkiRes.ok) {
      try {
        const json = JSON.parse(perevozkiText);
        if (json && typeof json === "object" && json.Success !== false) {
          perevozkiList = Array.isArray(json) ? json : json.items || [];
        }
      } catch {
        // ignore
      }
    }

    await pool.query(
      "update cache_perevozki set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(perevozkiList)]
    );

    // 2) Запрос счетов за весь период
    const invoicesUrl = `${INVOICES_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    const invoicesRes = await fetch(invoicesUrl, {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const invoicesText = await invoicesRes.text();
    let invoicesList: unknown[] = [];
    if (invoicesRes.ok) {
      try {
        const json = JSON.parse(invoicesText);
        if (json && typeof json === "object" && json.Success !== false) {
          invoicesList = Array.isArray(json) ? json : json.items ?? json.Invoices ?? json.invoices ?? [];
        }
      } catch {
        // ignore
      }
    }

    await pool.query(
      "update cache_invoices set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(Array.isArray(invoicesList) ? invoicesList : [])]
    );

    return res.status(200).json({
      ok: true,
      perevozki: perevozkiList.length,
      invoices: Array.isArray(invoicesList) ? invoicesList.length : 0,
    });
  } catch (e: any) {
    console.error("refresh-cache error:", e);
    return res.status(500).json({ error: "Refresh failed", details: e?.message || String(e) });
  }
}
