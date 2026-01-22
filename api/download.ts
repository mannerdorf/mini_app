import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

// Authorization: Basic YWRtaW46anVlYmZueWU=
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let login: string | undefined;
    let password: string | undefined;
    let metod: string | undefined;
    let number: string | undefined;

    if (req.method === "GET") {
      login = typeof req.query.login === "string" ? req.query.login : undefined;
      password =
        typeof req.query.password === "string" ? req.query.password : undefined;
      metod = typeof req.query.metod === "string" ? req.query.metod : undefined;
      number =
        typeof req.query.number === "string" ? req.query.number : undefined;
    } else {
      // Vercel иногда даёт body строкой
      let body: any = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: "Invalid JSON body" });
        }
      }

      ({ login, password, metod, number } = body ?? {});
    }

    if (!login || !password || !metod || !number) {
      return res.status(400).json({
        error: "Required fields: login, password, metod, number",
      });
    }

    // Формируем URL ровно как в Postman/curl:
    // https://.../GetFile?metod=ЭР&Number=000107984
    const fullUrl = new URL(EXTERNAL_API_BASE_URL);
    fullUrl.searchParams.set("metod", metod);
    fullUrl.searchParams.set("Number", number);

    console.log("➡️ GetFile URL:", fullUrl.toString());
    console.log("➡️ Request params:", { metod, number, login: login?.substring(0, 10) + "..." });

    const options: https.RequestOptions = {
      protocol: fullUrl.protocol,
      hostname: fullUrl.hostname,
      port: fullUrl.port || 443,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
      headers: {
        // Порядок как в твоём curl:
        // --header 'Auth: Basic order@lal-auto.com:ZakaZ656565'
        // --header 'Authorization: Basic YWRtaW46anVlYmZueWU='
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
        Accept: "*/*",
        "Accept-Encoding": "identity",
        "User-Agent": "curl/7.88.1",
        Host: fullUrl.host,
      },
    };
    
    console.log("➡️ Request headers:", {
      Auth: `Basic ${login?.substring(0, 10)}...`,
      Authorization: SERVICE_AUTH,
      Host: fullUrl.host,
    });

      const upstreamReq = https.request(options, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 500;
      const upstreamContentType =
        upstreamRes.headers["content-type"] || "application/octet-stream";
      
      console.log(
        "⬅️ Upstream status:",
        statusCode,
        "type:",
        upstreamContentType,
        "len:",
        upstreamRes.headers["content-length"],
      );
      console.log("⬅️ Upstream headers:", JSON.stringify(upstreamRes.headers, null, 2));

      // Если 1С вернула ошибку — просто пробрасываем как есть
      if (statusCode < 200 || statusCode >= 300) {
        res.status(statusCode);
        // может быть текст/JSON — просто прокидываем
        upstreamRes.pipe(res);
        return;
      }

      // Буферизуем первые байты для проверки формата
      let firstChunk: Buffer | null = null;
      let chunks: Buffer[] = [];
      
      upstreamRes.on("data", (chunk: Buffer) => {
        if (firstChunk === null) {
          firstChunk = chunk;
          const header = chunk.slice(0, 4).toString();
          console.log("📄 File header:", header, "isPDF:", header.startsWith("%PDF"));
          
          // Если не PDF, логируем первые 100 байт для диагностики
          if (!header.startsWith("%PDF")) {
            console.log("⚠️ Not a PDF! First 100 bytes:", chunk.slice(0, 100).toString());
          }
        }
        chunks.push(chunk);
      });

      upstreamRes.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        console.log("📦 Total size:", fullBuffer.length, "bytes");
        
        // Проверяем, что это действительно PDF
        const firstBytes = fullBuffer.slice(0, 4).toString();
        const isPDF = firstBytes.startsWith("%PDF");
        
        // Если сервер вернул JSON (ошибка или другой ответ)
        if (!isPDF) {
          const textResponse = fullBuffer.toString("utf-8");
          console.log("⚠️ Server returned non-PDF response:", textResponse.substring(0, 200));
          
          // Пытаемся распарсить как JSON
          try {
            const jsonResponse = JSON.parse(textResponse);
            console.log("📋 JSON response:", JSON.stringify(jsonResponse));
            
            // Если это JSON с ошибкой или Success:false
            if (jsonResponse.Error || (jsonResponse.Success === false)) {
              console.error("❌ Server error:", jsonResponse.Error || "Unknown error");
              return res.status(400).json({
                error: "Server returned error",
                message: jsonResponse.Error || "Unknown error",
                response: jsonResponse,
              });
            }
            
            // Если Success:true но нет файла - файл не найден или неправильные параметры
            if (jsonResponse.Success === true && !isPDF) {
              console.error("❌ Server returned success but no PDF file. Response:", textResponse);
              return res.status(404).json({
                error: "File not found",
                message: "Server returned success but no PDF file. Check document type and number.",
                response: jsonResponse,
              });
            }
          } catch (e) {
            // Не JSON, но и не PDF - возвращаем как есть с предупреждением
            console.error("❌ Response is neither PDF nor JSON!");
          }
        }

        // Нормальный сценарий — отдаём файл
        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(
          `${metod}_${number}.pdf`,
        )}"`);
        res.setHeader("Content-Length", fullBuffer.length.toString());
        res.end(fullBuffer);
      });

      upstreamRes.on("error", (err) => {
        console.error("🔥 Upstream stream error:", err.message);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: "Upstream stream error", message: err.message });
        } else {
          res.end();
        }
      });
    });

    upstreamReq.on("error", (err) => {
      console.error("🔥 Proxy request error:", err.message);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "Proxy request error", message: err.message });
      } else {
        res.end();
      }
    });

    upstreamReq.end();
  } catch (err: any) {
    console.error("🔥 Proxy handler error:", err?.message || err);
    return res
      .status(500)
      .json({ error: "Proxy handler failed", message: err?.message });
  }
}
