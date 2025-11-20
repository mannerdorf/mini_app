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

  // Разбираем body (может быть уже объектом или строкой)
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

  const cleanLogin = (login || "").trim();
  const cleanPassword = (password || "").trim();

  if (!cleanLogin || !cleanPassword) {
    return res.status(400).json({ error: "login and password are required" });
  }

  // Для отладки можно посмотреть, что реально доходит
  console.log("PEREVOZKI AUTH CALL", {
    login: cleanLogin,
    passwordLength: cleanPassword.length,
    ua: req.headers["user-agent"],
  });

  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        // как в curl из Postman:
        // Auth: Basic order@lal-auto.com:ZakaZ656565
        Auth: `Basic ${cleanLogin}:${cleanPassword}`,
        // Authorization: Basic YWRtaW46anVlYmZueWU=
        Authorization: SERVICE_AUTH,
      },
    });

    const text = await upstream.text();

    console.log("PEREVOZKI AUTH RESPONSE", {
      status: upstream.status,
      ok: upstream.ok,
      bodyPreview: text.slice(0, 200),
    });

    if (!upstream.ok) {
      // возвращаем и статус, и текст из 1С как есть
      return res
        .status(upstream.status)
        .send(text || `Upstream error: ${upstream.status}`);
    }

    // если 1С вернул JSON — пробуем распарсить
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      // не JSON — возвращаем текст как есть
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
