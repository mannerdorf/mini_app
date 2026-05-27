import type { Pool } from "pg";
import { verifyRegisteredUser } from "./verifyRegisteredUser.js";

const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function hasAnyCustomer(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.length > 0;
  const o = payload as Record<string, unknown>;
  const items = o.items ?? o.Items ?? o.Customers ?? o.customers ?? o.data ?? o.Data ?? o.result ?? o.Result;
  if (Array.isArray(items)) return items.length > 0;
  if (o.INN != null || o.Inn != null || o.inn != null) return true;
  const values = Object.values(o);
  return values.some((v) => v && typeof v === "object" && ("INN" in (v as object) || "Inn" in (v as object) || "inn" in (v as object)));
}

/** Проверка логина/пароля: CMS (registered_users) или учётка 1С (Getcustomers). */
export async function verifyAppCredentials(
  pool: Pool,
  login: string,
  password: string
): Promise<boolean> {
  const loginKey = String(login).trim().toLowerCase();
  if (!loginKey || !password) return false;

  const registered = await verifyRegisteredUser(pool, loginKey, password);
  if (registered) return true;

  const url = new URL(GETAPI_BASE);
  url.searchParams.set("metod", "Getcustomers");
  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) return false;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if (o.Success === false) return false;
      let payload: unknown = data;
      payload = o.Customers ?? o.customers ?? o.items ?? o.Items ?? o.data ?? o.Data ?? o.result ?? o.Result ?? data;
      return hasAnyCustomer(payload);
    }
    return hasAnyCustomer(data);
  } catch {
    return false;
  }
}
