import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";

// сервисный Basic-auth: admin:juebfnye
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // читаем JSON из body
  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const {
    login,
    password,
    dateFrom = "2024-01-01",
    dateTo = "2026-01-01",
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  // URL как в Postman (с датами)
  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        // как в Postman:
        // Auth: Basic order@lal-auto.com:ZakaZ656565
        Auth: `Basic ${login}:${password}`,
        // Authorization: Basic YWRtaW46anVlYmZueWU=
        Authorization: SERVICE_AUTH,
      },
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      // пробуем вернуть текст 1С как есть
      return res.status(upstream.status).send(
        text || {
          error: `Upstream error: ${upstream.status}`,
        }
      );
    }

    // если это JSON — вернём JSON, если нет — просто текст
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
