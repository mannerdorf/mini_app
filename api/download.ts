import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "./lib/verifyRegisteredUser.js";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

// Authorization: Basic YWRtaW46anVlYmZueWU=
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function transliterateFilename(s: string): string {
  if (!s || typeof s !== "string") return s || "";
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const lower = c.toLowerCase();
    const t = TRANSLIT[lower];
    if (t !== undefined) out += c === c.toUpperCase() && c !== lower ? (t.charAt(0).toUpperCase() + t.slice(1)) : t;
    else out += c;
  }
  return out;
}

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
    let isRegisteredUser = false;
    let useSuperAdminCredentials = false;

    if (req.method === "GET") {
      login = typeof req.query.login === "string" ? req.query.login : undefined;
      password =
        typeof req.query.password === "string" ? req.query.password : undefined;
      metod = typeof req.query.metod === "string" ? req.query.metod : undefined;
      number =
        typeof req.query.number === "string" ? req.query.number : undefined;
      isRegisteredUser = req.query.isRegisteredUser === "true";
      useSuperAdminCredentials = req.query.useSuperAdminCredentials === "true";
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

      ({
        login,
        password,
        metod,
        number,
        isRegisteredUser,
        useSuperAdminCredentials,
      } = {
        ...body,
        isRegisteredUser: !!body?.isRegisteredUser,
        useSuperAdminCredentials: !!body?.useSuperAdminCredentials,
      });
    }

    if ((!login || !password) && !useSuperAdminCredentials && !isRegisteredUser) {
      return res.status(400).json({
        error: "Required fields: login, password (or useSuperAdminCredentials), metod, number",
      });
    }
    if (!metod || !number) {
      return res.status(400).json({
        error: "Required fields: metod, number",
      });
    }

    // basic validation to reduce abuse
    if (!/^[\p{L}\d _.-]{1,24}$/u.test(metod)) {
      return res.status(400).json({ error: "Invalid metod" });
    }
    if (!/^[0-9A-Za-zА-Яа-я._-]{1,64}$/u.test(number)) {
      return res.status(400).json({ error: "Invalid number" });
    }

    // Зарегистрированные (CMS) пользователи: проверяем доступ к перевозке, затем запрашиваем файл сервисным аккаунтом
    if (isRegisteredUser) {
      try {
        const pool = getPool();
        const verified = await verifyRegisteredUser(pool, login, password);
        if (!verified) {
          return res.status(401).json({ error: "Неверный email или пароль" });
        }
        const cacheRow = await pool.query<{ data: unknown[] }>(
          "SELECT data FROM cache_perevozki WHERE id = 1"
        );
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
            return res.status(404).json({ error: "Перевозка не найдена или нет доступа" });
          }
        }
        const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN || process.env.HAULZ_1C_SERVICE_LOGIN;
        const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD || process.env.HAULZ_1C_SERVICE_PASSWORD;
        if (serviceLogin && servicePassword) {
          login = serviceLogin;
          password = servicePassword;
        }
      } catch (e: any) {
        console.error("download registered user error:", e?.message || e);
        return res.status(500).json({ error: "Ошибка запроса", message: e?.message });
      }
    }

    // Явный режим: использовать сервисные креды из Vercel для GetFile.
    if (useSuperAdminCredentials) {
      const serviceLogin =
        process.env.PEREVOZKI_SERVICE_LOGIN ||
        process.env.HAULZ_1C_SERVICE_LOGIN;
      const servicePassword =
        process.env.PEREVOZKI_SERVICE_PASSWORD ||
        process.env.HAULZ_1C_SERVICE_PASSWORD;
      if (!serviceLogin || !servicePassword) {
        return res.status(503).json({
          error: "Service credentials are not configured",
          message:
            "Set PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD (or HAULZ_1C_SERVICE_LOGIN/HAULZ_1C_SERVICE_PASSWORD) in Vercel.",
        });
      }
      login = serviceLogin;
      password = servicePassword;
    }

    // Формируем URL ровно как в Postman/curl:
    // https://.../GetFile?metod=ЭР&Number=000107984
    const fullUrl = new URL(EXTERNAL_API_BASE_URL);
    fullUrl.searchParams.set("metod", metod);
    fullUrl.searchParams.set("Number", number);

    // Do not log credentials/PII; keep logs minimal
    console.log("➡️ GetFile:", { metod, number });

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
    
    // Avoid logging auth headers

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
        
        // Извлекаем имя файла из заголовков ответа сервера
        const extractFileName = (dispositionHeader: string | string[] | undefined, fallback: string): string => {
          if (!dispositionHeader) return fallback;
          const header = Array.isArray(dispositionHeader) ? dispositionHeader[0] : dispositionHeader;
          
          // Пробуем извлечь filename*=UTF-8''...
          const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
          if (utf8Match?.[1]) {
            try {
              return decodeURIComponent(utf8Match[1]);
            } catch {
              // Если декодирование не удалось, пробуем другие варианты
            }
          }
          
          // Пробуем извлечь filename="..."
          const quotedMatch = header.match(/filename="([^"]+)"/i);
          if (quotedMatch?.[1]) {
            try {
              return decodeURIComponent(quotedMatch[1]);
            } catch {
              return quotedMatch[1];
            }
          }
          
          // Пробуем извлечь filename=...
          const plainMatch = header.match(/filename=([^;]+)/i);
          if (plainMatch?.[1]) {
            const filename = plainMatch[1].trim();
            try {
              return decodeURIComponent(filename);
            } catch {
              return filename;
            }
          }
          
          return fallback;
        };
        
        const upstreamDisposition = upstreamRes.headers["content-disposition"];
        const defaultFileName = `${metod}_${number}.pdf`;
        const fileNameRaw = extractFileName(upstreamDisposition, defaultFileName);
        const fileName = transliterateFilename(fileNameRaw);
        
        console.log("📝 Extracted filename:", fileNameRaw, "-> translit:", fileName);
        
        // Проверяем, что это действительно PDF
        const firstBytes = fullBuffer.slice(0, 4).toString();
        const isPDF = firstBytes.startsWith("%PDF");
        
        // Если это бинарный PDF:
        // - GET (MAX): отдаём PDF напрямую
        // - POST (Telegram/mini-app): возвращаем JSON { data(base64), name }
        if (isPDF) {
          console.log("✅ Got binary PDF, returning directly");
          if (req.method === "GET") {
            res.status(200);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader("Content-Length", fullBuffer.length.toString());
            return res.end(fullBuffer);
          }
          return res.status(200).json({
            data: fullBuffer.toString("base64"),
            name: fileName,
          });
        }
        
        // Если не PDF — пробуем распарсить как JSON
        const textResponse = fullBuffer.toString("utf-8");
        console.log("⚠️ Server returned non-PDF response:", textResponse.substring(0, 500));
        
        try {
          const jsonResponse = JSON.parse(textResponse);
          console.log("📋 JSON response:", JSON.stringify(jsonResponse));
          
          // Если есть ошибка
          if (jsonResponse.Error && jsonResponse.Error !== "") {
            console.error("❌ Server error:", jsonResponse.Error);
            return res.status(400).json({
              error: "Server returned error",
              message: jsonResponse.Error,
            });
          }
          
          // Если есть data (base64) — декодируем и отдаём как PDF
          if (jsonResponse.data) {
            console.log("✅ Got base64 data, decoding to PDF. Size:", jsonResponse.data.length);
            const pdfBuffer = Buffer.from(jsonResponse.data, "base64");
            const fileName = jsonResponse.name || `${metod}_${number}.pdf`;
            
            // Для GET запросов (MAX) — отдаём бинарный PDF для просмотра
            if (req.method === "GET") {
              res.status(200);
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
              res.setHeader("Content-Length", pdfBuffer.length.toString());
              return res.end(pdfBuffer);
            }
            
            // Для POST запросов (Telegram) — возвращаем JSON с base64 как ожидает клиент
            return res.status(200).json({
              data: jsonResponse.data,
              name: fileName,
            });
          }
          
          // Success:true но нет data — файл не найден
          console.error("❌ No file data in response. Keys:", Object.keys(jsonResponse));
          // Файл не найден — не причина для бана
          return res.status(404).json({
            error: "File not found",
            message: `Документ ${metod} для перевозки ${number} не найден`,
          });
          
        } catch (e) {
          // Не JSON и не PDF — возвращаем ошибку
          console.error("❌ Response is neither PDF nor valid JSON!", e);
          // Форматная ошибка — не причина для бана
          return res.status(500).json({
            error: "Invalid response format",
            message: "Server returned neither PDF nor valid JSON",
            raw: textResponse.substring(0, 200),
          });
        }
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
