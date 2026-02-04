import type { VercelRequest, VercelResponse } from "@vercel/node";

const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type CustomerItem = { name: string; inn: string };

function normalizeCustomers(raw: unknown): CustomerItem[] {
  if (!raw || typeof raw !== "object") return [];
  let arr: any[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    const o = raw as Record<string, unknown>;
    const items = o.items ?? o.Items ?? o.Customers ?? o.customers;
    if (Array.isArray(items)) {
      arr = items;
    } else if (o.INN != null || o.Inn != null || o.inn != null) {
      // Один объект-компания в корне
      arr = [o];
    } else {
      // Возможно массив под другими ключами или объект с числовыми ключами
      const values = Object.values(o);
      if (values.some((v) => v && typeof v === "object" && ("INN" in (v as any) || "Inn" in (v as any) || "inn" in (v as any)))) {
        arr = values.filter((v) => v && typeof v === "object") as any[];
      }
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((el: any) => {
      const name =
        el?.name ?? el?.Name ?? el?.Customer ?? el?.customer ?? "";
      const inn = String(el?.Inn ?? el?.INN ?? el?.inn ?? "").trim();
      if (!inn) return null;
      return { name: String(name).trim() || inn, inn };
    })
    .filter((x): x is CustomerItem => x != null && x.inn.length > 0);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { login, password } = body || {};
  if (!login || !password) {
    return res
      .status(400)
      .json({ error: "login and password are required" });
  }

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

    if (!upstream.ok) {
      try {
        const errJson = JSON.parse(text) as Record<string, unknown>;
        const message = (errJson?.Error ?? errJson?.error ?? errJson?.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : text || upstream.statusText;
        return res.status(upstream.status).json({ error: errorText });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(200).json({ customers: [] });
    }

    // Формат 1С: { Success, Error, Key }. Если Success === false — только текст ошибки (например "Не найден пользователь", "Неверный пароль").
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if (o.Success === false) {
        const message = (o.Error ?? o.error ?? o.message) as string | undefined;
        const errorText = typeof message === "string" && message.trim() ? message.trim() : "Ошибка авторизации";
        return res.status(401).json({ error: errorText });
      }
    }
    let payload: unknown = data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      payload = o.Customers ?? o.customers ?? o.items ?? o.Items ?? o.data ?? o.Data ?? o.result ?? o.Result ?? data;
    }
    const customers = normalizeCustomers(payload);

    return res.status(200).json({ customers });
  } catch (e: any) {
    console.error("Getcustomers proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
