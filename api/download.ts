import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { getPool } from "./_db.js";
import {
  cleanTransportNumberInput,
  normalizeWbPerevozkaHaulzDigits,
  stripToTransportDigits,
  transportAccessKeysMatch,
} from "./lib/wbPerevozkaDigits.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const GETAPI_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";

// Authorization: Basic YWRtaW46anVlYmZueWU= (admin:juebfnye)
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
// Для Договор и АктСверки используется Auth: Basic Info@haulz.pro:Y2ME42XyI_
const HAULZ_AUTH = "Basic Info@haulz.pro:Y2ME42XyI_";
// Для АПП в WB: как в Postman (Getperevozka/GetFile) через order@lal-auto.com
const WB_APP_ORDER_AUTH =
  process.env.WB_APP_ORDER_AUTH || "Basic order@lal-auto.com:ZakaZ656565";

async function precheckWbAppPerevozka(number: string): Promise<{ ok: boolean; status: number; text: string }> {
  const u = new URL(GETAPI_BASE_URL);
  u.searchParams.set("metod", "Getperevozka");
  u.searchParams.set("Number", number);
  const r = await fetch(u.toString(), {
    headers: {
      Auth: WB_APP_ORDER_AUTH,
      Authorization: SERVICE_AUTH,
      Accept: "application/json, text/plain, */*",
    },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

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

/** Декодирует HTML-сущности для [ ] и пробелов, чтобы regex мог найти плейсхолдеры */
function decodeHtmlForPlaceholders(s: string): string {
  return s
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&lsqb;/g, "[")
    .replace(/&rsqb;/g, "]")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ");
}

/** Удаляет span'ы с цветом #c2c8d1 (служебный текст 1С в договорах) */
function removeGrayPlaceholderSpans(html: string): string {
  return html.replace(
    /<span\s[^>]*style\s*=\s*["'][^"']*#c2c8d1[^"']*["'][^>]*>[^<]*<\/span>/gi,
    ""
  );
}

/** Удаляет служебные символы 1С из HTML: [#Ключ значение#] → значение, [#Ключ#] → "" */
function clean1cPlaceholders(html: string): string {
  const decoded = decodeHtmlForPlaceholders(html);
  let result = removeGrayPlaceholderSpans(decoded);
  // Поддержка обычных [ ] и полной ширины ［ ］
  const patterns = [/\[#([^#]*)#\]/g, /［#([^#]*)#］/g];
  for (const re of patterns) {
    result = result.replace(re, (_, inner) => {
      const trimmed = String(inner).trim();
      const m = trimmed.match(/^\S+\s+(.+)$/s);
      let val = m ? m[1].trim() : "";
      if (/^[\s_\-]+$/.test(val)) val = "";
      return val;
    });
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "download");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    let login: string | undefined;
    let password: string | undefined;
    let metod: string | undefined;
    let number: string | undefined;
    let dateDoc: string | undefined;
    let dateDog: string | undefined;
    let inn: string | undefined;
    let isRegisteredUser = false;

    if (req.method === "GET") {
      login = typeof req.query.login === "string" ? req.query.login : undefined;
      password =
        typeof req.query.password === "string" ? req.query.password : undefined;
      metod = typeof req.query.metod === "string" ? req.query.metod : undefined;
      number =
        typeof req.query.number === "string" ? req.query.number : undefined;
      dateDoc = typeof req.query.dateDoc === "string" ? req.query.dateDoc : undefined;
      dateDog = typeof req.query.dateDog === "string" ? req.query.dateDog : undefined;
      inn = typeof req.query.inn === "string" ? req.query.inn : undefined;
      isRegisteredUser = req.query.isRegisteredUser === "true";
    } else {
      // Vercel иногда даёт body строкой
      let body: any = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
        }
      }

      ({
        login,
        password,
        metod,
        number,
        dateDoc,
        dateDog,
        inn,
        isRegisteredUser,
      } = {
        ...body,
        isRegisteredUser: !!body?.isRegisteredUser,
      });
    }

    number = cleanTransportNumberInput(String(number ?? ""));
    if (!metod || !number) {
      return res.status(400).json({
        error: "Required fields: metod, number",
        request_id: ctx.requestId,
      });
    }
    // АктСверки и РеестрКсчету требуют dateDoc
    if ((metod === "АктСверки" || metod === "AktSverki" || metod === "РеестрКсчету") && !dateDoc) {
      return res.status(400).json({
        error: "Required fields: metod, number, dateDoc",
        request_id: ctx.requestId,
      });
    }
    // Договор требует dateDog и inn
    if ((metod === "Договор" || metod === "Dogovor") && (!dateDog || !inn)) {
      return res.status(400).json({
        error: "Required fields for Договор: metod, number, dateDog, inn",
        request_id: ctx.requestId,
      });
    }
    if (isRegisteredUser && (!login || !password)) {
      return res.status(400).json({
        error: "Required fields for registered user: login, password, metod, number",
        request_id: ctx.requestId,
      });
    }

    // basic validation to reduce abuse
    if (!/^[\p{L}\d _.-]{1,24}$/u.test(metod)) {
      return res.status(400).json({ error: "Invalid metod", request_id: ctx.requestId });
    }
    if (!/^[0-9A-Za-zА-Яа-я._-]{1,64}$/u.test(number)) {
      return res.status(400).json({ error: "Invalid number", request_id: ctx.requestId });
    }
    if (dateDoc && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateDoc)) {
      return res.status(400).json({ error: "Invalid dateDoc format (expected YYYY-MM-DDTHH:MM:SS)", request_id: ctx.requestId });
    }
    if (dateDog && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateDog)) {
      return res.status(400).json({ error: "Invalid dateDog format (expected YYYY-MM-DDTHH:MM:SS)", request_id: ctx.requestId });
    }
    if (inn && !/^\d{10,12}$/.test(String(inn).trim())) {
      return res.status(400).json({ error: "Invalid inn (expected 10-12 digits)", request_id: ctx.requestId });
    }

    const isWbAppMethod = metod === "АПП";

    // Зарегистрированные (CMS) пользователи: проверяем доступ к перевозке, затем запрашиваем файл сервисным аккаунтом
    // РеестрКсчету использует номер счёта — проверка cache_perevozki не применима
    if (isRegisteredUser && metod !== "РеестрКсчету" && !isWbAppMethod) {
      try {
        const pool = getPool();
        const verified = await verifyRegisteredUser(pool, login, password);
        if (!verified) {
          return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
        }
        const cacheRow = await pool.query<{ data: unknown[] }>(
          "SELECT data FROM cache_perevozki WHERE id = 1"
        );
        if (cacheRow.rows.length > 0) {
          const data = cacheRow.rows[0].data as any[];
          const list = Array.isArray(data) ? data : [];
          const item = list.find((i: any) => {
            if (!transportAccessKeysMatch(i?.Number ?? i?.number ?? "", number)) return false;
            if (verified.accessAllInns) return true;
            const itemInn = String(i?.INN ?? i?.Inn ?? i?.inn ?? "").trim();
            return itemInn === (verified.inn ?? "");
          });
          if (!item) {
            return res.status(404).json({ error: "Перевозка не найдена или нет доступа", request_id: ctx.requestId });
          }
        }
        const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
        const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;
        if (serviceLogin && servicePassword) {
          login = serviceLogin;
          password = servicePassword;
        }
      } catch (e: any) {
        logError(ctx, "download_registered_user_failed", e);
        return res.status(500).json({ error: "Ошибка запроса", message: e?.message, request_id: ctx.requestId });
      }
    }
    // РеестрКсчету: после verify пользователя переключаемся на сервисные креды
    if (isRegisteredUser && metod === "РеестрКсчету") {
      try {
        const pool = getPool();
        const verified = await verifyRegisteredUser(pool, login, password);
        if (!verified) {
          return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
        }
        const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
        const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;
        if (serviceLogin && servicePassword) {
          login = serviceLogin;
          password = servicePassword;
        }
      } catch (e: any) {
        logError(ctx, "download_registered_user_failed", e);
        return res.status(500).json({ error: "Ошибка запроса", message: e?.message, request_id: ctx.requestId });
      }
    }

    // Для Договор, АктСверки и РеестрКсчету используем Info@haulz.pro (Auth) + admin (Authorization), как в Postman
    // АПП и Счет/Акт — как в карточке груза: Auth с PEREVOZKI_SERVICE_*; ЭР — Haulz (как в Postman)
    const useHaulzAuth =
      metod === "Договор" ||
      metod === "Dogovor" ||
      metod === "АктСверки" ||
      metod === "AktSverki" ||
      metod === "РеестрКсчету" ||
      metod === "ЭР";
    const useWbOrderAuth = isWbAppMethod;

    if (useHaulzAuth) {
      // Auth: Basic Info@haulz.pro:Y2ME42XyI_, Authorization: Basic YWRtaW46anVlYmZueWU=
      login = "";
      password = "";
    } else if (useWbOrderAuth) {
      login = "";
      password = "";
    } else {
      const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
      const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;
      if (!serviceLogin || !servicePassword) {
        return res.status(503).json({
          error: "Service credentials are not configured",
          message:
            "Set PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD in Vercel.",
          request_id: ctx.requestId,
        });
      }
      login = serviceLogin;
      password = servicePassword;
    }

    // АПП/ЭР: в Number только цифры с ведущими нулями (после очистки служебных символов).
    if (metod === "АПП" || metod === "ЭР") {
      const td = stripToTransportDigits(String(number));
      if (td) number = normalizeWbPerevozkaHaulzDigits(td);
    }

    if (isWbAppMethod) {
      const pre = await precheckWbAppPerevozka(number);
      if (!pre.ok) {
        return res.status(404).json({
          error: "Перевозка не найдена или нет доступа (Getperevozka)",
          upstream_status: pre.status,
          upstream_snippet: pre.text.slice(0, 500),
          request_id: ctx.requestId,
        });
      }
    }

    // Формируем URL ровно как в Postman/curl:
    // https://.../GetFile?metod=ЭР&Number=000107984
    // для АктСверки: metod=АктСверки&Number=0000-00015&DateDoc=2021-10-25T12:51:10
    const fullUrl = new URL(EXTERNAL_API_BASE_URL);
    fullUrl.searchParams.set("metod", metod);
    fullUrl.searchParams.set("Number", number);
    if (dateDoc) fullUrl.searchParams.set("DateDoc", dateDoc);
    if (dateDog) fullUrl.searchParams.set("DateDog", dateDog);
    if (inn) fullUrl.searchParams.set("INN", String(inn).trim());

    // Do not log credentials/PII; keep logs minimal
    console.log("➡️ GetFile:", { metod, number, dateDoc: dateDoc ? "***" : undefined, dateDog: dateDog ? "***" : undefined, inn: inn ? "***" : undefined });

    const options: https.RequestOptions = {
      protocol: fullUrl.protocol,
      hostname: fullUrl.hostname,
      port: fullUrl.port || 443,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
      headers: {
        // Для Договор/АктСверки: Auth: Basic Info@haulz.pro:Y2ME42XyI_
        // Для ЭР и др.: Auth: Basic login:password
        Auth: useHaulzAuth
          ? HAULZ_AUTH
          : useWbOrderAuth
            ? WB_APP_ORDER_AUTH
            : `Basic ${login}:${password}`,
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
              request_id: ctx.requestId,
            });
          }
          
          // Если есть data — может быть base64 (PDF) или raw HTML (Договор возвращает HTML в data)
          if (jsonResponse.data) {
            const dataStr = String(jsonResponse.data);
            const fileName = jsonResponse.name || `${metod}_${number}.pdf`;
            const isBase64 = /^[A-Za-z0-9+/]*=*$/.test(dataStr.replace(/\s/g, "")) && dataStr.length > 0;

            if (isBase64) {
              // Base64 — декодируем как PDF
              console.log("✅ Got base64 data, decoding to PDF. Size:", dataStr.length);
              const pdfBuffer = Buffer.from(dataStr, "base64");
              if (req.method === "GET") {
                res.status(200);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
                res.setHeader("Content-Length", pdfBuffer.length.toString());
                return res.end(pdfBuffer);
              }
              return res.status(200).json({ data: dataStr, name: fileName });
            }

            // Договор возвращает raw HTML в data — чистим [#ключ#] и кодируем в base64
            if (dataStr.trimStart().startsWith("<") || /^\s*<!DOCTYPE/i.test(dataStr) || /^\s*<html/i.test(dataStr)) {
              const cleanedHtml = clean1cPlaceholders(dataStr);
              console.log("✅ Got HTML data (Договор), cleaned placeholders, encoding to base64. Size:", cleanedHtml.length);
              const b64 = Buffer.from(cleanedHtml, "utf-8").toString("base64");
              const fname = /\.html?$/i.test(fileName) ? fileName : fileName.replace(/\.\w+$/, "") + ".html";
              if (req.method === "GET") {
                res.status(200);
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fname)}"`);
                return res.end(cleanedHtml, "utf-8");
              }
              return res.status(200).json({ data: b64, name: fname, isHtml: true });
            }

            console.error("❌ jsonResponse.data is neither base64 nor HTML");
            return res.status(500).json({
              error: "Invalid response format",
              message: "Сервер вернул данные в неожиданном формате",
              request_id: ctx.requestId,
            });
          }
          
          // Success:true но нет data — файл не найден
          console.error("❌ No file data in response. Keys:", Object.keys(jsonResponse));
          // Файл не найден — не причина для бана
          return res.status(404).json({
            error: "File not found",
            message: `Документ ${metod} для перевозки ${number} не найден`,
            request_id: ctx.requestId,
          });
          
        } catch (e) {
          // Не JSON и не PDF — возвращаем ошибку
          console.error("❌ Response is neither PDF nor valid JSON!", e);
          // Форматная ошибка — не причина для бана
          return res.status(500).json({
            error: "Invalid response format",
            message: "Server returned neither PDF nor valid JSON",
            raw: textResponse.substring(0, 200),
            request_id: ctx.requestId,
          });
        }
      });

      upstreamRes.on("error", (err) => {
        console.error("🔥 Upstream stream error:", err.message);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: "Upstream stream error", message: err.message, request_id: ctx.requestId });
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
          .json({ error: "Proxy request error", message: err.message, request_id: ctx.requestId });
      } else {
        res.end();
      }
    });

    upstreamReq.end();
  } catch (err: any) {
    logError(ctx, "download_proxy_handler_failed", err);
    return res
      .status(500)
      .json({ error: "Proxy handler failed", message: err?.message, request_id: ctx.requestId });
  }
}
