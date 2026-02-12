import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let login: string | undefined;
  let password: string | undefined;
  let number: string | undefined;
  let inn: string | undefined;

  let isRegisteredUser = false;
  if (req.method === "GET") {
    login = typeof req.query.login === "string" ? req.query.login : undefined;
    password =
      typeof req.query.password === "string" ? req.query.password : undefined;
    number =
      typeof req.query.number === "string" ? req.query.number : undefined;
    inn = typeof req.query.inn === "string" ? req.query.inn : undefined;
    isRegisteredUser = req.query.isRegisteredUser === "true";
  } else {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }
    ({ login, password, number, inn, isRegisteredUser } = body ?? {});
  }

  if (!login || !password || !number) {
    return res.status(400).json({
      error: "Required: login, password, number",
    });
  }

  if (!/^[0-9A-Za-zА-Яа-я._-]{1,64}$/u.test(number)) {
    return res.status(400).json({ error: "Invalid number" });
  }

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login!, password!);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль" });
      }
      const cacheRow = await pool.query<{ data: unknown[] }>(
        "SELECT data FROM cache_perevozki WHERE id = 1"
      );
      if (cacheRow.rows.length > 0) {
        const data = cacheRow.rows[0].data as any[];
        const list = Array.isArray(data) ? data : [];
        const norm = String(number).trim();
        const item = list.find((i: any) => {
          const n = String(i?.Number ?? i?.number ?? "").trim();
          if (n !== norm) return false;
          if (verified.accessAllInns) return true;
          const itemInn = String(i?.INN ?? i?.Inn ?? i?.inn ?? "").trim();
          return itemInn === verified.inn;
        });
        if (item) return res.status(200).json(item);
      }
      return res.status(404).json({ error: "Перевозка не найдена" });
    } catch (e) {
      console.error("getperevozka registered user error:", e);
      return res.status(500).json({ error: "Ошибка запроса" });
    }
  }

  const url = new URL(GETAPI_BASE);
  url.searchParams.set("metod", "Getperevozka");
  url.searchParams.set("Number", number);
  if (inn && String(inn).trim()) {
    url.searchParams.set("INN", String(inn).trim());
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      try {
        const errJson = JSON.parse(text);
        return res.status(upstream.status).json(errJson);
      } catch {
        return res
          .status(upstream.status)
          .json({ error: text || `Upstream error: ${upstream.status}` });
      }
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Getperevozka proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
