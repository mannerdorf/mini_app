import type { Pool } from "pg";
import { verifyRegisteredUser } from "./verifyRegisteredUser.js";
import { normalizeCustomers } from "../api/getcustomers.js";

export class CompanyAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Resolve identity and companies on the server. Never accept company assignments from a client. */
export async function resolveCompanyAccess(pool: Pool, login: unknown, password: unknown) {
  if (typeof login !== "string" || !login.trim() || typeof password !== "string" || !password) {
    throw new CompanyAccessError(401, "Требуется авторизация");
  }
  const key = login.trim().toLowerCase();
  const { rows: existing } = await pool.query("SELECT login FROM registered_users WHERE lower(trim(login)) = $1", [key]);
  if (existing.length) {
    const user = await verifyRegisteredUser(pool, key, password);
    if (!user) throw new CompanyAccessError(401, "Неверный логин или пароль");
    const { rows } = user.accessAllInns
      ? await pool.query<{ inn: string; name: string }>("SELECT inn, customer_name AS name FROM cache_customers ORDER BY customer_name, inn")
      : await pool.query<{ inn: string; name: string }>("SELECT inn, name FROM account_companies WHERE login = $1 ORDER BY name, inn", [key]);
    return { login: key, registered: true, customers: rows.map(row => ({ inn: String(row.inn ?? "").trim(), name: String(row.name ?? row.inn ?? "").trim() })) };
  }
  // Every legacy source is called with the user's credentials, never service-user credentials.
  const headers = { Auth: `Basic ${login.trim()}:${password}`, Authorization: "Basic YWRtaW46anVlYmZueWU=" };
  async function load(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new CompanyAccessError(502, "Не удалось проверить компании в 1С");
    }
    if (!response.ok) throw new CompanyAccessError(response.status === 401 || response.status === 403 ? 401 : 502, "Не удалось проверить компании в 1С");
    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || (data as Record<string, unknown>).Success === false) {
      throw new CompanyAccessError(401, "Не удалось подтвердить учётную запись 1С");
    }
    return data;
  }
  function unwrap(data: unknown): unknown {
    const object = data as Record<string, unknown>;
    return object.Customers ?? object.customers ?? object.items ?? object.Items ?? object.data ?? object.Data ?? object.result ?? object.Result ?? data;
  }
  try {
    const payload = unwrap(await load("https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=Getcustomers"));
    const customers = normalizeCustomers(payload).map(({ inn, name }) => ({ inn, name }));
    if (customers.length) return { login: key, registered: false, customers };
  } catch (error) {
    if (!(error instanceof CompanyAccessError)) throw error;
  }
  // API-v1 accounts already use this fallback at login. Derive the same first
  // customer from their authenticated upstream response, never from submitted data.
  const legacyUrl = new URL("https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki");
  legacyUrl.searchParams.set("DateB", "2024-01-01");
  legacyUrl.searchParams.set("DateE", new Date().toISOString().slice(0, 10));
  const payload = unwrap(await load(legacyUrl.toString()));
  const rows: Record<string, unknown>[] = Array.isArray(payload) ? payload : [];
  const customer = rows.find(row => row && (row.Customer || row.customer));
  const inn = String(customer?.INN ?? customer?.Inn ?? "").trim();
  const name = String(customer?.Customer ?? customer?.customer ?? "").trim();
  if (!inn || !name) throw new CompanyAccessError(403, "1С не подтвердила доступные компании");
  return { login: key, registered: false, customers: [{ inn, name }] };
}
