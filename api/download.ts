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

      // Если 1С вернула ошибку — просто пробрасываем как есть
      if (statusCode < 200 || statusCode >= 300) {
        res.status(statusCode);
        // может быть текст/JSON — просто прокидываем
        upstreamRes.pipe(res);
        return;
      }

      // Нормальный сценарий — прокидываем файл потоком
      // Для просмотра в браузере используем inline и явный PDF Content-Type
      res.status(200);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(
        `${metod}_${number}.pdf`,
      )}"`);

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

      upstreamRes.pipe(res);
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
