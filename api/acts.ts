import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Прокси для GetActs: УПД (универсальные передаточные документы).
 * GET https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs?DateB=...&DateE=...
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const {
    login,
    password,
    dateFrom = "2024-01-01",
    dateTo = new Date().toISOString().split("T")[0],
    inn,
    serviceMode,
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res
      .status(400)
      .json({ error: "Invalid date format (YYYY-MM-DD required)" });
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (!serviceMode && inn && String(inn).trim()) {
    url.searchParams.set("INN", String(inn).trim());
  }

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
        const message = (errJson?.Error ?? errJson?.error ?? errJson?.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : text || upstream.statusText;
        return res.status(upstream.status).json({ error: errorText });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : "Ошибка авторизации";
        return res.status(401).json({ error: errorText });
      }
      const list = Array.isArray(json) ? json : (json?.items ?? json?.Acts ?? json?.acts ?? []);
      return res.status(200).json(Array.isArray(list) ? list : []);
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    console.error("Acts proxy error:", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e) });
  }
}
