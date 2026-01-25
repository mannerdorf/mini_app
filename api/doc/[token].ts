import type { VercelRequest, VercelResponse } from "@vercel/node";
import { docTokenStore } from "../shorten-doc";
import https from "https";
import { URL } from "url";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

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

  const docData = docTokenStore.get(token);

  if (!docData) {
    return res.status(404).json({ error: "Document link not found or expired" });
  }

  // Удаляем токен после использования (одноразовый)
  docTokenStore.delete(token);

  // Формируем URL для скачивания документа
  const fullUrl = new URL(EXTERNAL_API_BASE_URL);
  fullUrl.searchParams.set("metod", docData.metod);
  fullUrl.searchParams.set("Number", docData.number);

  // Проксируем запрос к внешнему API и возвращаем PDF
  return new Promise<void>((resolve) => {
    const options: https.RequestOptions = {
      protocol: fullUrl.protocol,
      hostname: fullUrl.hostname,
      port: fullUrl.port || 443,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
      headers: {
        Auth: `Basic ${docData.login}:${docData.password}`,
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
            `inline; filename="${docData.metod}_${docData.number}.pdf"`
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
                `inline; filename="${docData.metod}_${docData.number}.pdf"`
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
