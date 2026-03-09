import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { initRequestContext, logError } from "./_lib/observability.js";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

// Telegram Bot Token - нужно добавить в Environment Variables на Vercel
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

async function sendDocumentToChat(
  chatId: string | number,
  fileBuffer: Buffer,
  fileName: string,
  caption?: string
): Promise<TelegramResponse> {
  return new Promise((resolve, reject) => {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    
    // Формируем multipart/form-data
    const parts: Buffer[] = [];
    
    // chat_id
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
      `${chatId}\r\n`
    ));
    
    // caption (если есть)
    if (caption) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="caption"\r\n\r\n` +
        `${caption}\r\n`
      ));
    }
    
    // document (файл)
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const body = Buffer.concat(parts);
    
    const options: https.RequestOptions = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${BOT_TOKEN}/sendDocument`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };
    
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid response from Telegram"));
        }
      });
    });
    
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getFileFromExternalAPI(
  login: string,
  password: string,
  metod: string,
  number: string
): Promise<{ buffer: Buffer; name: string } | { error: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(EXTERNAL_API_BASE_URL);
    fullUrl.searchParams.set("metod", metod);
    fullUrl.searchParams.set("Number", number);

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

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        const firstBytes = fullBuffer.slice(0, 4).toString();
        
        // Если это бинарный PDF
        if (firstBytes.startsWith("%PDF")) {
          resolve({ buffer: fullBuffer, name: `${metod}_${number}.pdf` });
          return;
        }
        
        // Пробуем распарсить как JSON
        try {
          const json = JSON.parse(fullBuffer.toString("utf-8"));
          
          if (json.Error && json.Error !== "") {
            resolve({ error: json.Error });
            return;
          }
          
          if (json.data) {
            const pdfBuffer = Buffer.from(json.data, "base64");
            const fileName = json.name || `${metod}_${number}.pdf`;
            resolve({ buffer: pdfBuffer, name: fileName });
            return;
          }
          
          resolve({ error: `Документ ${metod} для перевозки ${number} не найден` });
        } catch {
          resolve({ error: "Некорректный ответ от сервера" });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "send-document");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "Bot token not configured", request_id: ctx.requestId });
  }

  try {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
      }
    }

    const { login, password, metod, number, chatId } = body ?? {};

    if (!login || !password || !metod || !number || !chatId) {
      return res.status(400).json({
        error: "Required fields: login, password, metod, number, chatId",
        request_id: ctx.requestId,
      });
    }

    console.log("📤 Sending document to chat:", { chatId, metod, number });

    // Получаем файл
    const fileResult = await getFileFromExternalAPI(login, password, metod, number);
    
    if ("error" in fileResult) {
      console.error("❌ File error:", fileResult.error);
      return res.status(404).json({ error: fileResult.error, request_id: ctx.requestId });
    }

    console.log("✅ Got file:", fileResult.name, "size:", fileResult.buffer.length);

    // Отправляем в чат
    const telegramResult = await sendDocumentToChat(
      chatId,
      fileResult.buffer,
      fileResult.name,
      `📄 ${metod} — перевозка ${number}`
    );

    if (!telegramResult.ok) {
      console.error("❌ Telegram error:", telegramResult.description);
      return res.status(500).json({
        error: "Failed to send document",
        message: telegramResult.description,
        request_id: ctx.requestId,
      });
    }

    console.log("✅ Document sent to chat:", chatId);
    return res.status(200).json({ success: true, message: "Документ отправлен в чат", request_id: ctx.requestId });
    
  } catch (err: any) {
    logError(ctx, "send_document_failed", err);
    return res.status(500).json({
      error: "Failed to send document",
      message: err?.message,
      request_id: ctx.requestId,
    });
  }
}
