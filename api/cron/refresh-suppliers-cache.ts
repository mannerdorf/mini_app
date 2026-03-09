import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";

const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function getStr(el: any, ...keys: string[]): string {
  if (!el || typeof el !== "object") return "";
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

function extractCounterpartyArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const from =
    obj.Items ??
    obj.items ??
    obj.Customers ??
    obj.customers ??
    obj.Counterparties ??
    obj.counterparties ??
    obj.Counterpartys ??
    obj.counterpartys ??
    obj.Kontragents ??
    obj.kontragents ??
    obj.Contragents ??
    obj.contragents ??
    obj.Suppliers ??
    obj.suppliers ??
    obj.Data ??
    obj.data ??
    obj.Result ??
    obj.result ??
    obj.Rows ??
    obj.rows;
  if (Array.isArray(from)) return from;
  if (obj.INN != null || obj.Inn != null || obj.inn != null) return [obj];
  return [];
}

function normalizeSuppliers(raw: unknown): { inn: string; supplier_name: string; email: string }[] {
  const arr = extractCounterpartyArray(raw);
  const byInn = new Map<string, { inn: string; supplier_name: string; email: string }>();
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    let inn = getStr(el, "Inn", "INN", "inn", "ИНН", "Code", "code", "Код");
    inn = inn.replace(/\D/g, "") || inn.trim();
    if (!inn || (inn.length !== 10 && inn.length !== 12)) continue;
    const name =
      getStr(
        el,
        "Name",
        "name",
        "Supplier",
        "supplier",
        "Contragent",
        "contragent",
        "Kontragent",
        "kontragent",
        "Поставщик",
        "Контрагент",
        "Наименование"
      ) || inn;
    const email = getStr(el, "Email", "email", "E-mail", "e-mail", "Почта", "Mail");
    byInn.set(inn, { inn, supplier_name: name, email });
  }
  return Array.from(byInn.values());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    return res.status(cronAuthError.status).json({ error: cronAuthError.error });
  }

  const login = process.env.SUPPLIERS_1C_LOGIN || process.env.PEREVOZKI_SERVICE_LOGIN;
  const password = process.env.SUPPLIERS_1C_PASSWORD || process.env.PEREVOZKI_SERVICE_PASSWORD;
  if (!login || !password) {
    return res.status(503).json({ error: "Не заданы SUPPLIERS_1C_LOGIN/PASSWORD или PEREVOZKI_SERVICE_LOGIN/PASSWORD" });
  }

  try {
    const upstreamUrl = `${GETAPI_URL}?metod=GETALLKontragents`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `HTTP ${upstream.status}`, details: text.slice(0, 200) });
    }

    const json = JSON.parse(text);
    if (json && typeof json === "object" && (json as any).Success === false) {
      const err = String((json as any).Error ?? (json as any).error ?? (json as any).message ?? "Success=false");
      return res.status(502).json({ error: err });
    }

    const rows = normalizeSuppliers(json);
    if (rows.length === 0) {
      return res.status(502).json({
        error: "1С вернул пустой список поставщиков — кэш не перезаписан",
        upstream_url: upstreamUrl,
      });
    }
    const pool = getPool();
    await pool.query("delete from cache_suppliers");
    const inns = rows.map((r) => r.inn);
    const names = rows.map((r) => r.supplier_name);
    const emails = rows.map((r) => r.email);
    await pool.query(
      `insert into cache_suppliers (inn, supplier_name, email, fetched_at)
       select inn, supplier_name, email, now()
       from unnest($1::text[], $2::text[], $3::text[]) as t(inn, supplier_name, email)
       on conflict (inn) do update
         set supplier_name = excluded.supplier_name,
             email = excluded.email,
             fetched_at = now()`,
      [inns, names, emails]
    );

    return res.status(200).json({ ok: true, suppliers_count: rows.length, refreshed_at: new Date().toISOString() });
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error("refresh-suppliers-cache error:", message);
    return res.status(500).json({ error: "Ошибка обновления кэша поставщиков", details: message });
  }
}
