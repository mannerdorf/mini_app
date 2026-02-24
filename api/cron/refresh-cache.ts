import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const ACTS_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function extractCustomerArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const from =
    o.Items ?? o.items ?? o.Customers ?? o.customers ?? o.Data ?? o.data ?? o.Result ?? o.result ?? o.Rows ?? o.rows;
  if (Array.isArray(from)) return from;
  if (o.INN != null || o.Inn != null || o.inn != null) return [o];
  const values = Object.values(o);
  if (values.some((v: any) => v && typeof v === "object" && ("INN" in v || "Inn" in v || "inn" in v || "ИНН" in v)))
    return values.filter((v) => v && typeof v === "object") as any[];
  return [];
}

function getStr(el: any, ...keys: string[]): string {
  if (!el || typeof el !== "object") return "";
  for (const k of keys) {
    const v = el[k];
    if (v != null && v !== "") return String(v).trim();
  }
  return "";
}

function extractArrayFromAnyPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const known = [
    obj.items,
    obj.Items,
    obj.zayavki,
    obj.Zayavki,
    obj.otpravki,
    obj.Otpravki,
    obj.data,
    obj.Data,
    obj.result,
    obj.Result,
    obj.rows,
    obj.Rows,
  ];
  for (const candidate of known) {
    if (Array.isArray(candidate)) return candidate;
  }
  // Fallback: first array-like field in payload.
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeCacheCustomers(raw: unknown): { inn: string; customer_name: string; email: string }[] {
  const arr = extractCustomerArray(raw);
  const byInn = new Map<string, { inn: string; customer_name: string; email: string }>();
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    let inn = getStr(el, "Inn", "INN", "inn", "ИНН", "Code", "code", "Код");
    inn = (inn.replace(/\D/g, "") || inn.trim());
    if (!inn || (inn.length !== 10 && inn.length !== 12)) continue;
    const name =
      getStr(el, "Name", "name", "Customer", "customer", "Contragent", "contragent", "Client", "client", "Заказчик", "Наименование") || inn;
    const email = getStr(el, "Email", "email", "E-mail", "e-mail", "Почта", "Mail");
    byInn.set(inn, { inn, customer_name: name, email });
  }
  return Array.from(byInn.values());
}

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

  const login = process.env.PEREVOZKI_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD;
  if (!login || !password) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(503).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка конфигурации</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка конфигурации</h1><p>В Vercel не заданы PEREVOZKI_SERVICE_LOGIN и PEREVOZKI_SERVICE_PASSWORD.</p></body></html>');
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
    await pool.query(
      "create table if not exists cache_orders (id int primary key default 1 check (id = 1), data jsonb not null default '[]', fetched_at timestamptz not null default now())"
    );
    await pool.query(
      "insert into cache_orders (id, data, fetched_at) values (1, '[]', '1970-01-01') on conflict (id) do nothing"
    );
    // 1.0) Запрос заявок через GETAPI/GetZayavki
    let ordersList: unknown[] = [];
    try {
      const ordersUrl = `${GETAPI_URL}?metod=GetZayavki&DateB=${dateFrom}&DateE=${dateTo}`;
      const ordersRes = await fetch(ordersUrl, {
        method: "GET",
        headers: {
          Auth: `Basic ${login}:${password}`,
          Authorization: SERVICE_AUTH,
        },
      });
      const ordersText = await ordersRes.text();
      if (ordersRes.ok) {
        try {
          const json = JSON.parse(ordersText);
          if (json && typeof json === "object" && json.Success !== false) {
            ordersList = extractArrayFromAnyPayload(json);
          }
        } catch {
          // ignore
        }
      } else {
        console.warn("refresh-cache orders non-ok:", ordersRes.status, ordersText.slice(0, 200));
      }
    } catch (e: any) {
      console.error("refresh-cache orders fetch error:", e?.message || e);
    }
    await pool.query(
      "update cache_orders set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(Array.isArray(ordersList) ? ordersList : [])]
    );
    await pool.query(
      "create table if not exists cache_sendings (id int primary key default 1 check (id = 1), data jsonb not null default '[]', fetched_at timestamptz not null default now())"
    );
    await pool.query(
      "insert into cache_sendings (id, data, fetched_at) values (1, '[]', '1970-01-01') on conflict (id) do nothing"
    );

    // 1.1) Запрос отправок через GETAPI/Getotpravki
    let sendingsList: unknown[] = [];
    try {
      const sendingsUrl = `${GETAPI_URL}?metod=Getotpravki&DateB=${dateFrom}&DateE=${dateTo}`;
      const sendingsRes = await fetch(sendingsUrl, {
        method: "GET",
        headers: {
          Auth: `Basic ${login}:${password}`,
          Authorization: SERVICE_AUTH,
        },
      });
      const sendingsText = await sendingsRes.text();
      if (sendingsRes.ok) {
        try {
          const json = JSON.parse(sendingsText);
          if (json && typeof json === "object" && json.Success !== false) {
            sendingsList = extractArrayFromAnyPayload(json);
          }
        } catch {
          // ignore
        }
      } else {
        console.warn("refresh-cache sendings non-ok:", sendingsRes.status, sendingsText.slice(0, 200));
      }
    } catch (e: any) {
      console.error("refresh-cache sendings fetch error:", e?.message || e);
    }
    await pool.query(
      "update cache_sendings set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(Array.isArray(sendingsList) ? sendingsList : [])]
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

    // 3) Запрос УПД за весь период
    let actsList: unknown[] = [];
    try {
      const actsUrl = `${ACTS_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
      const actsRes = await fetch(actsUrl, {
        method: "GET",
        headers: {
          Auth: `Basic ${login}:${password}`,
          Authorization: SERVICE_AUTH,
        },
      });
      const actsText = await actsRes.text();
      if (actsRes.ok) {
        try {
          const json = JSON.parse(actsText);
          if (json && typeof json === "object" && json.Success !== false) {
            actsList = Array.isArray(json) ? json : json.items ?? json.Acts ?? json.acts ?? [];
          }
        } catch {
          // ignore
        }
      } else {
        console.warn("refresh-cache acts non-ok:", actsRes.status, actsText.slice(0, 200));
      }
    } catch (e: any) {
      console.error("refresh-cache acts fetch error:", e?.message || e);
    }
    await pool.query(
      "update cache_acts set data = $1, fetched_at = now() where id = 1",
      [JSON.stringify(Array.isArray(actsList) ? actsList : [])]
    );

    // 4) Заказчики из Getcustomers (ИНН, Заказчик, email). Пакетная вставка в БД.
    let customersCount = 0;
    try {
      const customersUrl = `${GETAPI_URL}?metod=Getcustomers`;
      const customersRes = await fetch(customersUrl, {
        method: "GET",
        headers: {
          Auth: `Basic ${login}:${password}`,
          Authorization: SERVICE_AUTH,
        },
      });
      const customersText = await customersRes.text();
      if (customersRes.ok) {
        try {
          const json = JSON.parse(customersText);
          const rows = json?.Success === false ? [] : normalizeCacheCustomers(json);
          await pool.query("delete from cache_customers");
          if (rows.length > 0) {
            const inns = rows.map((r) => r.inn);
            const names = rows.map((r) => r.customer_name);
            const emails = rows.map((r) => r.email);
            await pool.query(
              `insert into cache_customers (inn, customer_name, email, fetched_at)
               select inn, customer_name, email, now()
               from unnest($1::text[], $2::text[], $3::text[]) as t(inn, customer_name, email)
               on conflict (inn) do update set customer_name = excluded.customer_name, email = excluded.email, fetched_at = now()`,
              [inns, names, emails]
            );
          }
          customersCount = rows.length;
        } catch {
          // ignore
        }
      } else {
        console.warn("refresh-cache Getcustomers non-ok:", customersRes.status, customersText.slice(0, 200));
      }
    } catch (e: any) {
      console.error("refresh-cache Getcustomers fetch error:", e?.message || e);
    }

    const perevozkiCount = perevozkiList.length;
    const sendingsCount = Array.isArray(sendingsList) ? sendingsList.length : 0;
    const ordersCount = Array.isArray(ordersList) ? ordersList.length : 0;
    const invoicesCount = Array.isArray(invoicesList) ? invoicesList.length : 0;
    const actsCount = Array.isArray(actsList) ? actsList.length : 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Кэш обновлён</title></head><body style="font-family:sans-serif;padding:2rem;max-width:40rem;margin:0 auto;background:#fff;color:#111;"><h1>Кэш обновлён</h1><p>Перевозок: <strong>${perevozkiCount}</strong></p><p>Заявок: <strong>${ordersCount}</strong></p><p>Отправок: <strong>${sendingsCount}</strong></p><p>Счетов: <strong>${invoicesCount}</strong></p><p>УПД: <strong>${actsCount}</strong></p><p>Заказчиков (Getcustomers): <strong>${customersCount}</strong></p><p style="color:#666;font-size:0.9rem;">Период: ${dateFrom} — ${dateTo}. Данные в БД, мини-апп отдаёт из кэша 15 мин.</p></body></html>`;
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
