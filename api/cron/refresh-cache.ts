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
  const querySecret = typeof req.query.secret === "string" ? req.query.secret : "";
  const provided = bearer || querySecret;
  if (secret && provided !== secret) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(401).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Нет доступа</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Нет доступа</h1><p>Неверный или отсутствующий секрет (<code>?secret=...</code>).</p></body></html>');
  }

  const login = process.env.PEREVOZKI_SERVICE_LOGIN || process.env.HAULZ_1C_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD || process.env.HAULZ_1C_SERVICE_PASSWORD;
  if (!login || !password) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка</h1><p>В Vercel не заданы PEREVOZKI_SERVICE_LOGIN и PEREVOZKI_SERVICE_PASSWORD.</p></body></html>');
  }

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 90); // последние 90 дней — укладываемся в таймаут 300 с (Vercel)
  const dateFrom = fromDate.toISOString().split("T")[0];

  let pool;
  try {
    pool = getPool();
  } catch (e: any) {
    const msg = e?.message || "Database unavailable";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>БД недоступна</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">БД недоступна</h1><p>${String(msg).replace(/</g, "&lt;")}</p><p>Проверьте DATABASE_URL в Vercel.</p></body></html>`);
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

    // 2) Запрос счетов за весь период (отдельный try — при ошибке всё равно обновляем fetched_at)
    let invoicesList: unknown[] = [];
    try {
      const invoicesUrl = `${INVOICES_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
      const invoicesRes = await fetch(invoicesUrl, {
        method: "GET",
        headers: {
          Auth: `Basic ${login}:${password}`,
          Authorization: SERVICE_AUTH,
        },
      });
      const invoicesText = await invoicesRes.text();
      if (invoicesRes.ok) {
        try {
          const json = JSON.parse(invoicesText);
          if (json && typeof json === "object" && json.Success !== false) {
            invoicesList = Array.isArray(json) ? json : json.items ?? json.Invoices ?? json.invoices ?? [];
          }
        } catch {
          // ignore
        }
      } else {
        console.warn("refresh-cache invoices non-ok:", invoicesRes.status, invoicesText.slice(0, 200));
      }
    } catch (e: any) {
      console.error("refresh-cache invoices fetch error:", e?.message || e);
    }
    await pool.query(
      "update cache_invoices set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(Array.isArray(invoicesList) ? invoicesList : [])]
    );

    const perevozkiCount = perevozkiList.length;
    const invoicesCount = Array.isArray(invoicesList) ? invoicesList.length : 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Кэш обновлён</title></head><body style="font-family:sans-serif;padding:2rem;max-width:40rem;margin:0 auto;background:#fff;color:#111;"><h1>Кэш обновлён</h1><p>Перевозок: <strong>${perevozkiCount}</strong></p><p>Счетов: <strong>${invoicesCount}</strong></p><p style="color:#666;font-size:0.9rem;">Период: ${dateFrom} — ${dateTo}. Данные в БД, мини-апп отдаёт из кэша 15 мин.</p></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (e: any) {
    console.error("refresh-cache error:", e);
    const msg = e?.message || String(e);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка обновления кэша</h1><p>${msg.replace(/</g, "&lt;")}</p></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(html);
  }
}
