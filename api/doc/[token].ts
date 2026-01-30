import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { getRedisValue } from "../redis";

// Document download handler - uses only Redis (no in-memory fallback)
const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

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
      return res.status(404).json({ error: "Document link not found or expired" });
    }

    console.log(`[doc/[token]] Processing document: ${docData.metod} for ${docData.number}`);

    // Формируем URL для скачивания документа ровно как в api/download.ts
    const { login, password, metod, number } = docData;
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
                res.status(400).json({ error: json.Error });
              } else {
                console.error(`[doc/[token]] ❌ Unknown JSON format`);
                res.status(404).json({ error: "Документ не обнаружен" });
              }
            } catch (e) {
              console.error(`[doc/[token]] ❌ Failed to parse as JSON`);
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
