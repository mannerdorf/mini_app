import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { getPool } from "../../_db.js";
import { verifyRegisteredUser } from "../../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "../_lib/observability.js";

// Document download handler - uses only Redis (no in-memory fallback)
const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error("[doc/[token]] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing!");
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
  const ctx = initRequestContext(req, res, "doc-token");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
    }

    const token = req.query.token as string;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token is required", request_id: ctx.requestId });
    }

    console.log(`[doc/[token]] Looking up token: ${token.substring(0, 8)}...`);

    // Пробуем получить из Redis
    let docDataJson = await getRedisValue(`doc:${token}`);
    let docData: { login: string; password: string; metod: string; number: string; isRegisteredUser?: boolean } | null = null;

    if (docDataJson) {
      try {
        docData = JSON.parse(docDataJson);
        console.log(`[doc/[token]] Found in Redis`);
        // Не удаляем токен сразу, чтобы ссылка работала несколько раз (например, при превью в мессенджерах)
        // Он удалится сам через час по TTL
      } catch (parseError) {
        console.error(`[doc/[token]] Failed to parse JSON from Redis:`, parseError);
        docData = null;
      }
    }

    // В serverless окружении in-memory хранилище не работает
    // Используем только Redis
    if (!docData) {
      console.log(`[doc/[token]] Token not found or expired: ${token.substring(0, 8)}...`);
      return res.status(404).json({ error: "Document link not found or expired", request_id: ctx.requestId });
    }

    console.log(`[doc/[token]] Processing document: ${docData.metod} for ${docData.number}`);

    const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
    const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;
    if (!serviceLogin || !servicePassword) {
      return res.status(503).json({
        error: "Service credentials are not configured",
        message: "Set PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD in Vercel.",
        request_id: ctx.requestId,
      });
    }

    let { login, password, metod, number } = docData;
    // CMS-пользователи: проверяем доступ, затем запрашиваем файл сервисным аккаунтом
    if (docData.isRegisteredUser) {
      try {
        const pool = getPool();
        const verified = await verifyRegisteredUser(pool, login, password);
        if (!verified) {
          return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
        }
        const cacheRow = await pool.query<{ data: unknown[] }>("SELECT data FROM cache_perevozki WHERE id = 1");
        if (cacheRow.rows.length > 0) {
          const data = cacheRow.rows[0].data as any[];
          const list = Array.isArray(data) ? data : [];
          const norm = String(number).trim();
          const item = list.find((i: any) => {
            const n = String(i?.Number ?? i?.number ?? "").trim();
            if (n !== norm) return false;
            if (verified.accessAllInns) return true;
            const itemInn = String(i?.INN ?? i?.Inn ?? i?.inn ?? "").trim();
            return itemInn === (verified.inn ?? "");
          });
          if (!item) {
            return res.status(404).json({ error: "Перевозка не найдена или нет доступа", request_id: ctx.requestId });
          }
        }
      } catch (e: any) {
        logError(ctx, "doc_token_registered_user_failed", e);
        return res.status(500).json({ error: "Ошибка запроса", message: e?.message, request_id: ctx.requestId });
      }
    }
    login = serviceLogin;
    password = servicePassword;
    const fullUrl = new URL(EXTERNAL_API_BASE_URL);
    fullUrl.searchParams.set("metod", metod);
    fullUrl.searchParams.set("Number", number);

    console.log(`[doc/[token]] ➡️ Upstream request for ${metod} ${number}`);

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

        console.log(`[doc/[token]] ⬅️ Upstream status: ${statusCode}, type: ${contentType}`);

        if (statusCode < 200 || statusCode >= 300) {
          console.error(`[doc/[token]] Upstream error status: ${statusCode}`);
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

          console.log(`[doc/[token]] 📦 Received ${fullBuffer.length} bytes, isPDF: ${isPDF}`);

          if (isPDF) {
            // Извлекаем имя файла (как в api/download.ts)
            const extractFileName = (dispositionHeader: string | string[] | undefined, fallback: string): string => {
              if (!dispositionHeader) return fallback;
              const header = Array.isArray(dispositionHeader) ? dispositionHeader[0] : dispositionHeader;
              const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
              if (utf8Match?.[1]) { try { return decodeURIComponent(utf8Match[1]); } catch {} }
              const quotedMatch = header.match(/filename="([^"]+)"/i);
              if (quotedMatch?.[1]) { try { return decodeURIComponent(quotedMatch[1]); } catch { return quotedMatch[1]; } }
              const plainMatch = header.match(/filename=([^;]+)/i);
              if (plainMatch?.[1]) { const fn = plainMatch[1].trim(); try { return decodeURIComponent(fn); } catch { return fn; } }
              return fallback;
            };

            const fileName = extractFileName(upstreamRes.headers["content-disposition"], `${metod}_${number}.pdf`);
            console.log(`[doc/[token]] ✅ Sending PDF: ${fileName}`);

            res.status(200);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
              "Content-Disposition",
              `inline; filename="${encodeURIComponent(fileName)}"`
            );
            res.setHeader("Content-Length", fullBuffer.length.toString());
            res.end(fullBuffer);
          } else {
            // Пробуем распарсить как JSON
            const textResponse = fullBuffer.toString("utf-8");
            console.log(`[doc/[token]] ⚠️ Not a PDF, first 100 chars: ${textResponse.substring(0, 100)}`);
            try {
              const json = JSON.parse(textResponse);
              if (json.data) {
                console.log(`[doc/[token]] ✅ Got base64 data in JSON, decoding...`);
                const pdfBuffer = Buffer.from(json.data, "base64");
                const fileName = json.name || `${metod}_${number}.pdf`;
                res.status(200);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader(
                  "Content-Disposition",
                  `inline; filename="${encodeURIComponent(fileName)}"`
                );
                res.setHeader("Content-Length", pdfBuffer.length.toString());
                res.end(pdfBuffer);
              } else if (json.Error) {
                console.error(`[doc/[token]] ❌ Upstream logic error: ${json.Error}`);
                res.status(400).json({ error: json.Error, request_id: ctx.requestId });
              } else {
                console.error(`[doc/[token]] ❌ Unknown JSON format`);
                res.status(404).json({ error: "Документ не обнаружен", request_id: ctx.requestId });
              }
            } catch (e) {
              console.error(`[doc/[token]] ❌ Failed to parse as JSON`);
              res.status(500).json({ error: "Ошибка сервера. Попробуйте позже.", request_id: ctx.requestId });
            }
          }
          resolve();
        });

      upstreamRes.on("error", (err) => {
        console.error("Upstream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Ошибка сервера. Попробуйте позже.", request_id: ctx.requestId });
        }
        resolve();
      });
    });

    upstreamReq.on("error", (err) => {
      console.error("[doc/[token]] Request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Ошибка сервера. Попробуйте позже.", request_id: ctx.requestId });
      }
      resolve();
    });

    upstreamReq.end();
  });
  } catch (error: any) {
    logError(ctx, "doc_token_handler_failed", error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: "Internal server error",
        message: error?.message || String(error),
        request_id: ctx.requestId,
      });
    }
  }
}
