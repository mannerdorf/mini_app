import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "buffer"; 

const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";

// сервисный Basic-auth (должен быть закодирован в Base64)
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

// Определяем тип для ожидаемого тела запроса
interface RequestBody {
  login?: string;
  password?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Разбираем body и приводим к нужному типу
  let body: RequestBody;
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  } else {
    body = req.body || {};
  }

  const {
    login,
    password,
    dateFrom = "2024-01-01",
    dateTo = "2026-01-01",
  } = body;

  const cleanLogin = (login || "").trim();
  const cleanPassword = (password || "").trim();

  if (!cleanLogin || !cleanPassword) {
    return res.status(400).json({ error: "login and password are required" });
  }

  // Логирование (без чувствительных данных)
  console.log("PEREVOZKI AUTH CALL", {
    login: cleanLogin,
    ua: req.headers["user-agent"],
  });

  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);

  // --- КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Base64 кодирование пользовательских данных ---
  // API 1С ожидает Basic Auth, где данные пользователя закодированы в Base64.
  const userAuthBase64 = Buffer.from(`${cleanLogin}:${cleanPassword}`).toString(
    "base64"
  );

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        // Заголовок с пользовательским Basic Auth
        Auth: `Basic ${userAuthBase64}`,
        // Заголовок с сервисным Basic Auth для доступа к прокси
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
      // Возвращаем статус и текст из 1С как есть
      return res
        .status(upstream.status)
        .send(text || `Upstream error: ${upstream.status}`);
    }

    // Если 1С вернул JSON — пробуем распарсить
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      // Не JSON — возвращаем текст как есть
      return res.status(200).send(text);
    }
  } catch (error) {
    // Улучшенная обработка ошибок
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Proxy error:", error);
    return res
      .status(500)
      .json({ error: "Proxy error", details: errorMessage });
  }
}
