import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";
import { URL } from "url";
import { cleanTransportNumberInput } from "../api/lib/wbPerevozkaDigits.js";
import {
  isHaulzGetFileMetod,
  normalizeGetFileNumber,
} from "./getFileMetodConfig.js";
import { normalizeBase64Payload } from "./base64Document.js";

export const GET_FILE_EXTERNAL_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const HAULZ_AUTH = "Basic Info@haulz.pro:Y2ME42XyI_";

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

function decodeHtmlForPlaceholders(s: string): string {
  return s
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&lsqb;/g, "[")
    .replace(/&rsqb;/g, "]")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ");
}

function removeGrayPlaceholderSpans(html: string): string {
  return html.replace(
    /<span\s[^>]*style\s*=\s*["'][^"']*#c2c8d1[^"']*["'][^>]*>[^<]*<\/span>/gi,
    "",
  );
}

function clean1cPlaceholders(html: string): string {
  const decoded = decodeHtmlForPlaceholders(html);
  let result = removeGrayPlaceholderSpans(decoded);
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

export type GetFileParams = {
  metod: string;
  number: string;
  dateDoc?: string;
  dateDog?: string;
  inn?: string;
};

export type GetFileValidationResult =
  | { ok: true; params: GetFileParams }
  | { ok: false; status: number; error: string };

export function validateGetFileParams(raw: Partial<GetFileParams>): GetFileValidationResult {
  let metod = String(raw.metod ?? "").trim();
  let number = cleanTransportNumberInput(String(raw.number ?? ""));
  const dateDoc = raw.dateDoc ? String(raw.dateDoc).trim() : undefined;
  const dateDog = raw.dateDog ? String(raw.dateDog).trim() : undefined;
  const inn = raw.inn != null && String(raw.inn).trim() !== "" ? String(raw.inn).trim() : undefined;

  if (!metod || !number) {
    return { ok: false, status: 400, error: "Required fields: metod, number" };
  }
  if ((metod === "АктСверки" || metod === "AktSverki" || metod === "РеестрКсчету") && !dateDoc) {
    return { ok: false, status: 400, error: "Required fields: metod, number, dateDoc" };
  }
  if ((metod === "Договор" || metod === "Dogovor") && (!dateDog || !inn)) {
    return { ok: false, status: 400, error: "Required fields for Договор: metod, number, dateDog, inn" };
  }
  if (!/^[\p{L}\d _.-]{1,24}$/u.test(metod)) {
    return { ok: false, status: 400, error: "Invalid metod" };
  }
  if (!/^[0-9A-Za-zА-Яа-я._-]{1,64}$/u.test(number)) {
    return { ok: false, status: 400, error: "Invalid number" };
  }
  if (dateDoc && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateDoc)) {
    return { ok: false, status: 400, error: "Invalid dateDoc format (expected YYYY-MM-DDTHH:MM:SS)" };
  }
  if (dateDog && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateDog)) {
    return { ok: false, status: 400, error: "Invalid dateDog format (expected YYYY-MM-DDTHH:MM:SS)" };
  }
  if (inn && !/^\d{10,12}$/.test(inn)) {
    return { ok: false, status: 400, error: "Invalid inn (expected 10-12 digits)" };
  }

  if (metod === "АПП" || metod === "ЭР" || metod === "Счет" || metod === "Счёт" || metod === "Акт") {
    number = normalizeGetFileNumber(metod, String(number));
  }

  return { ok: true, params: { metod, number, dateDoc, dateDog, inn } };
}

function resolveGetFileCredentials(metod: string): { useHaulzAuth: boolean; login: string; password: string } | { error: string } {
  const useHaulzAuth = isHaulzGetFileMetod(metod);

  if (useHaulzAuth) {
    return { useHaulzAuth: true, login: "", password: "" };
  }

  const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
  const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;
  if (!serviceLogin || !servicePassword) {
    return {
      error: "Service credentials are not configured (PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD)",
    };
  }
  return { useHaulzAuth: false, login: serviceLogin, password: servicePassword };
}

/** Прокси GetFile из 1С. POST → JSON { data, name }; GET → бинарный файл. */
export async function proxyGetFileDownload(
  req: VercelRequest,
  res: VercelResponse,
  requestId: string,
  params: GetFileParams,
): Promise<void> {
  const { metod, number, dateDoc, dateDog, inn } = params;
  const creds = resolveGetFileCredentials(metod);
  if ("error" in creds) {
    res.status(503).json({ error: creds.error, request_id: requestId });
    return;
  }

  const fullUrl = new URL(GET_FILE_EXTERNAL_URL);
  fullUrl.searchParams.set("metod", metod);
  fullUrl.searchParams.set("Number", number);
  if (dateDoc) fullUrl.searchParams.set("DateDoc", dateDoc);
  if (dateDog) fullUrl.searchParams.set("DateDog", dateDog);
  if (inn) fullUrl.searchParams.set("INN", inn);

  console.log("➡️ GetFile:", {
    metod,
    number,
    dateDoc: dateDoc ? "***" : undefined,
    dateDog: dateDog ? "***" : undefined,
    inn: inn ? "***" : undefined,
  });

  const options: https.RequestOptions = {
    protocol: fullUrl.protocol,
    hostname: fullUrl.hostname,
    port: fullUrl.port || 443,
    path: fullUrl.pathname + fullUrl.search,
    method: "GET",
    headers: {
      Auth: creds.useHaulzAuth ? HAULZ_AUTH : `Basic ${creds.login}:${creds.password}`,
      Authorization: SERVICE_AUTH,
      Accept: "*/*",
      "Accept-Encoding": "identity",
      "User-Agent": "curl/7.88.1",
      Host: fullUrl.host,
    },
  };

  await new Promise<void>((resolve) => {
    const upstreamReq = https.request(options, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 500;

      if (statusCode < 200 || statusCode >= 300) {
        res.status(statusCode);
        upstreamRes.pipe(res);
        upstreamRes.on("end", () => resolve());
        return;
      }

      const chunks: Buffer[] = [];

      upstreamRes.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      upstreamRes.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);

        const extractFileName = (dispositionHeader: string | string[] | undefined, fallback: string): string => {
          if (!dispositionHeader) return fallback;
          const header = Array.isArray(dispositionHeader) ? dispositionHeader[0] : dispositionHeader;
          const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
          if (utf8Match?.[1]) {
            try {
              return decodeURIComponent(utf8Match[1]);
            } catch {
              /* fall through */
            }
          }
          const quotedMatch = header.match(/filename="([^"]+)"/i);
          if (quotedMatch?.[1]) {
            try {
              return decodeURIComponent(quotedMatch[1]);
            } catch {
              return quotedMatch[1];
            }
          }
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
        const isPDF = fullBuffer.slice(0, 4).toString().startsWith("%PDF");

        if (isPDF) {
          if (req.method === "GET") {
            res.status(200);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader("Content-Length", fullBuffer.length.toString());
            res.end(fullBuffer);
            resolve();
            return;
          }
          res.status(200).json({ data: fullBuffer.toString("base64"), name: fileName });
          resolve();
          return;
        }

        const textResponse = fullBuffer.toString("utf-8");
        try {
          const jsonResponse = JSON.parse(textResponse) as Record<string, unknown>;
          if (jsonResponse.Error && jsonResponse.Error !== "") {
            res.status(400).json({
              error: "Server returned error",
              message: String(jsonResponse.Error),
              request_id: requestId,
            });
            resolve();
            return;
          }

          if (jsonResponse.data) {
            const dataStr = String(jsonResponse.data);
            const respName = String(jsonResponse.name || `${metod}_${number}.pdf`);
            const isBase64 = /^[A-Za-z0-9+/]*=*$/.test(dataStr.replace(/\s/g, "")) && dataStr.length > 0;

            if (isBase64) {
              const pdfBuffer = Buffer.from(dataStr, "base64");
              if (req.method === "GET") {
                res.status(200);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(respName)}"`);
                res.setHeader("Content-Length", pdfBuffer.length.toString());
                res.end(pdfBuffer);
                resolve();
                return;
              }
              res.status(200).json({ data: normalizeBase64Payload(dataStr), name: respName });
              resolve();
              return;
            }

            if (dataStr.trimStart().startsWith("<") || /^\s*<!DOCTYPE/i.test(dataStr) || /^\s*<html/i.test(dataStr)) {
              const cleanedHtml = clean1cPlaceholders(dataStr);
              const b64 = Buffer.from(cleanedHtml, "utf-8").toString("base64");
              const fname = /\.html?$/i.test(respName) ? respName : respName.replace(/\.\w+$/, "") + ".html";
              if (req.method === "GET") {
                res.status(200);
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fname)}"`);
                res.end(cleanedHtml, "utf-8");
                resolve();
                return;
              }
              res.status(200).json({ data: b64, name: fname, isHtml: true });
              resolve();
              return;
            }

            res.status(500).json({
              error: "Invalid response format",
              message: "Сервер вернул данные в неожиданном формате",
              request_id: requestId,
            });
            resolve();
            return;
          }

          res.status(404).json({
            error: "Файл не найден",
            message: `Документ ${metod} для перевозки ${number} не найден`,
            request_id: requestId,
          });
          resolve();
        } catch {
          res.status(500).json({
            error: "Invalid response format",
            message: "Server returned neither PDF nor valid JSON",
            raw: textResponse.substring(0, 200),
            request_id: requestId,
          });
          resolve();
        }
      });

      upstreamRes.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: "Upstream stream error", message: err.message, request_id: requestId });
        } else {
          res.end();
        }
        resolve();
      });
    });

    upstreamReq.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request error", message: err.message, request_id: requestId });
      } else {
        res.end();
      }
      resolve();
    });

    upstreamReq.end();
  });
}
