import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRateLimitContext,
  enforceRateLimit,
  getClientIp,
  markAuthFailure,
  markAuthSuccess,
} from "./_rateLimit";

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

  // --- Rate limit / brute force protection (Vercel KV) ---
  const rl = createRateLimitContext({
    namespace: "perevozki",
    ip: getClientIp(req),
    login,
    // tighter for auth:
    limit: 8,
    windowSec: 60,
    banAfterFailures: 12,
    banSec: 15 * 60,
  });
  const allowed = await enforceRateLimit(res, rl);
  if (!allowed) return;

  // validate dates to reduce abuse/noise
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)" });
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
      // Нормализуем ошибки, чтобы не светить "Upstream error: <code>"
      if (upstream.status === 401 || upstream.status === 403) {
        await markAuthFailure(rl);
        return res.status(401).json({ error: "Неверный логин или пароль." });
      }
      if (upstream.status === 404) {
        return res.status(404).json({ error: "Данные не найдены." });
      }
      if (upstream.status >= 500) {
        return res.status(502).json({ error: "Ошибка сервиса. Попробуйте позже." });
      }
      // пробуем распарсить текст 1С, иначе общий текст
      return res.status(upstream.status).json({
        error: "Не удалось получить данные. Попробуйте позже.",
      });
    }

    await markAuthSuccess(rl);
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
