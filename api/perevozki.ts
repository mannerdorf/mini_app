import type { VercelRequest, VercelResponse } from "@vercel/node";
import { upsertDocument } from "../lib/rag.js";

/**
 * Запрос данных перевозок — только этот метод:
 * GetPerevozki?DateB=...&DateE=...&INN=...
 * GetPerevozki и Getcustomers на фронте используются только для авторизации (добавление компаний с ИНН).
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";

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
  } = body || {};

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)" });
  }

  // Запрос данных перевозок — только DateB, DateE, INN (ИНН из аккаунта/БД при авторизации)
  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (inn) {
    url.searchParams.set("INN", String(inn).trim());
  }

  try {
    console.log("➡️ Perevozki request for:", login);
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

    console.log("⬅️ Upstream status:", upstream.status);
    const text = await upstream.text();
    console.log("⬅️ Upstream body start:", text.substring(0, 100));

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

    // если это JSON — вернём JSON, если нет — просто текст
    try {
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.items || [];
      if (Array.isArray(list) && list.length > 0) {
        ingestCargoItems(list, login).catch((error) => {
          console.error("RAG cargo ingest error:", error?.message || error);
        });
      }
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

function formatCargoContent(item: any) {
  const number = item?.Number ?? item?.number ?? "";
  const customer = item?.Customer ?? item?.customer ?? "";
  const lines = [
    `Перевозка: ${number}`,
    `Заказчик: ${customer}`,
    `Статус: ${item?.State ?? ""}`,
    `Дата приемки: ${item?.DatePrih ?? ""}`,
    `Дата доставки: ${item?.DateVr ?? ""}`,
    `Отправитель: ${item?.Sender ?? ""}`,
    `Мест: ${item?.Mest ?? ""}`,
    `Платный вес: ${item?.PW ?? ""}`,
    `Вес: ${item?.W ?? ""}`,
    `Объем: ${item?.Value ?? ""}`,
    `Сумма: ${item?.Sum ?? ""}`,
    `Статус счета: ${item?.StateBill ?? ""}`,
  ];

  return lines.filter((line) => !line.endsWith(": ")).join("\n");
}

async function ingestCargoItems(items: any[], login: string) {
  const batchSize = 5;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (item) => {
        const number = item?.Number ?? item?.number;
        if (!number) return;
        const customer = item?.Customer ?? item?.customer ?? null;
        const sourceId = `${customer || login}:${number}`;
        const content = formatCargoContent(item);
        if (!content) return;
        await upsertDocument({
          sourceType: "cargo",
          sourceId,
          title: `Перевозка ${number}`,
          content,
          metadata: {
            number,
            customer,
            datePrih: item?.DatePrih ?? null,
            dateVr: item?.DateVr ?? null,
            state: item?.State ?? null,
            sender: item?.Sender ?? null,
          },
        });
      }),
    );
  }
}
