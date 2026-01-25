import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";

// Document download handler - uses only Redis (no in-memory fallback)
const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[doc/[token]] Upstash Redis not configured in doc handler");
    return null;
  }

  try {
    // Проверяем доступность fetch
    if (typeof fetch === 'undefined') {
      console.error("[doc/[token]] fetch is not available in this runtime");
      return null;
    }
    
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", key]]),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[doc/[token]] Redis get error: ${response.status} ${text}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[doc/[token]] Redis response for ${key.substring(0, 8)}...:`, JSON.stringify(data).substring(0, 200));
    
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: "value"}] или [{result: "value", error: null}]
    const firstResult = Array.isArray(data) ? data[0] : data;
    
    // Проверяем наличие ошибки в ответе
    if (firstResult?.error) {
      console.error(`[doc/[token]] Redis error in response:`, firstResult.error);
      return null;
    }
    
    const value = firstResult?.result;
    
    // Если result null или undefined, значит ключ не найден
    if (value === null || value === undefined) {
      console.log(`[doc/[token]] Key not found in Redis: ${key.substring(0, 8)}...`);
      return null;
    }
    
    return String(value);
  } catch (error: any) {
    console.error(`[doc/[token]] Redis get exception:`, error?.message || error);
    return null;
  }
}

async function deleteRedis(key: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return false;

  try {
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["DEL", key]]),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("Redis delete error:", response.status, text);
      return false;
    }
    
    const data = await response.json();
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: 1}] (1 = удалено, 0 = не найдено)
    const firstResult = Array.isArray(data) ? data[0] : data;
    const deleted = firstResult?.result === 1 || firstResult?.result === true;
    
    return deleted;
  } catch (error) {
    console.error("Redis delete error:", error);
    return false;
  }
}

/**
 * Редирект/скачивание документа по токену
 * GET /api/doc/abc123...
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const token = req.query.token as string;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token is required" });
    }

    console.log(`[doc/[token]] Looking up token: ${token.substring(0, 8)}...`);

    // Пробуем получить из Redis
    let docDataJson = await getRedisValue(`doc:${token}`);
    let docData: { login: string; password: string; metod: string; number: string } | null = null;

    if (docDataJson) {
      try {
        docData = JSON.parse(docDataJson);
        console.log(`[doc/[token]] Found in Redis, deleting token`);
        // Удаляем токен из Redis (одноразовый)
        await deleteRedis(`doc:${token}`);
      } catch (parseError) {
        console.error(`[doc/[token]] Failed to parse JSON from Redis:`, parseError);
        docData = null;
      }
    }

    // В serverless окружении in-memory хранилище не работает
    // Используем только Redis
    if (!docData) {
      console.log(`[doc/[token]] Token not found or expired: ${token.substring(0, 8)}...`);
      return res.status(404).json({ error: "Document link not found or expired" });
    }

    console.log(`[doc/[token]] Processing document: ${docData.metod} for ${docData.number}`);

  // Формируем URL для скачивания документа
  const { login, password, metod, number } = docData;
  const fullUrl = new URL(EXTERNAL_API_BASE_URL);
  fullUrl.searchParams.set("metod", metod);
  fullUrl.searchParams.set("Number", number);

  // Проксируем запрос к внешнему API и возвращаем PDF
  return new Promise<void>((resolve) => {
    const options: https.RequestOptions = {
      protocol: fullUrl.protocol,
      hostname: fullUrl.hostname,
      port: fullUrl.port || 443,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
        Accept: "*/*",
        "Accept-Encoding": "identity",
        "User-Agent": "curl/7.88.1",
        Host: fullUrl.host,
      },
    };

    const upstreamReq = https.request(options, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 500;
      const contentType = upstreamRes.headers["content-type"] || "application/octet-stream";

      if (statusCode < 200 || statusCode >= 300) {
        res.status(statusCode);
        upstreamRes.pipe(res);
        resolve();
        return;
      }

      // Буферизуем ответ
      const chunks: Buffer[] = [];
      upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        const firstBytes = fullBuffer.slice(0, 4).toString();
        const isPDF = firstBytes.startsWith("%PDF");

        if (isPDF) {
          // Отдаем PDF напрямую
          res.status(200);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="${metod}_${number}.pdf"`
          );
          res.setHeader("Content-Length", fullBuffer.length.toString());
          res.end(fullBuffer);
        } else {
          // Пробуем распарсить как JSON
          try {
            const json = JSON.parse(fullBuffer.toString("utf-8"));
            if (json.data) {
              const pdfBuffer = Buffer.from(json.data, "base64");
              res.status(200);
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader(
                "Content-Disposition",
                `inline; filename="${metod}_${number}.pdf"`
              );
              res.setHeader("Content-Length", pdfBuffer.length.toString());
              res.end(pdfBuffer);
            } else {
              res.status(404).json({ error: "Документ не обнаружен" });
            }
          } catch {
            res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
          }
        }
        resolve();
      });

      upstreamRes.on("error", (err) => {
        console.error("Upstream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
        }
        resolve();
      });
    });

    upstreamReq.on("error", (err) => {
      console.error("[doc/[token]] Request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
      }
      resolve();
    });

    upstreamReq.end();
  });
  } catch (error: any) {
    console.error(`[doc/[token]] Handler error:`, error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: "Internal server error",
        message: error?.message || String(error)
      });
    }
  }
}
