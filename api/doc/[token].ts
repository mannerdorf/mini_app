import type { VercelRequest, VercelResponse } from "@vercel/node";
import { docTokenStore } from "../shorten-doc";
import https from "https";
import { URL } from "url";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
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
      console.error("Redis get error:", response.status, text);
      return null;
    }
    
    const data = await response.json();
    return data[0]?.result || null;
  } catch (error) {
    console.error("Redis get error:", error);
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
    return data[0]?.result === 1;
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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = req.query.token as string;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }

  // Пробуем получить из Redis
  let docDataJson = await getRedisValue(`doc:${token}`);
  let docData: { login: string; password: string; metod: string; number: string } | null = null;

  if (docDataJson) {
    try {
      docData = JSON.parse(docDataJson);
      // Удаляем токен из Redis (одноразовый)
      await deleteRedis(`doc:${token}`);
    } catch {
      docData = null;
    }
  }

  // Fallback: пробуем из памяти
  if (!docData) {
    const entry = docTokenStore.get(token);
    if (entry) {
      docData = {
        login: entry.login,
        password: entry.password,
        metod: entry.metod,
        number: entry.number,
      };
      // Удаляем токен из памяти
      docTokenStore.delete(token);
    }
  }

  if (!docData) {
    return res.status(404).json({ error: "Document link not found or expired" });
  }

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
      console.error("Request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
      }
      resolve();
    });

    upstreamReq.end();
  });
}
