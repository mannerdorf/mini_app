import {
  normalizeWbPerevozkaHaulzDigits,
  stripToTransportDigits,
} from "../api/lib/wbPerevozkaDigits.js";

/** GetFile: Auth Info@haulz.pro (как ЭР/АПП). Счёт/УПД — service (Haulz на Счет часто висит → 504). */
const HAULZ_GETFILE_METODS = new Set([
  "Договор",
  "Dogovor",
  "АктСверки",
  "AktSverki",
  "РеестрКсчету",
  "ЭР",
  "АПП",
]);

export function isHaulzGetFileMetod(metod: string): boolean {
  return HAULZ_GETFILE_METODS.has(metod);
}

/**
 * Номер перевозки для GetFile — pad до 9 цифр.
 * Номер счёта/реестра с дефисом (0000-000123) не трогаем.
 */
export function shouldNormalizePerevozkaNumberForGetFile(metod: string, number: string): boolean {
  if (metod === "ЭР" || metod === "АПП") return true;
  if (metod === "Счет" || metod === "Счёт" || metod === "Акт") {
    const raw = String(number ?? "");
    if (raw.includes("-")) return false;
    const digits = stripToTransportDigits(raw);
    return digits.length >= 5 && digits.length <= 12;
  }
  return false;
}

export function normalizeGetFileNumber(metod: string, number: string): string {
  if (!shouldNormalizePerevozkaNumberForGetFile(metod, number)) return number;
  const td = stripToTransportDigits(number);
  return td ? normalizeWbPerevozkaHaulzDigits(td) : number;
}

export type GetFileDebugInfo = {
  metod: string;
  number: string;
  dateDoc?: string;
  dateDog?: string;
  inn?: string;
  auth_mode: "haulz" | "service";
  upstream_url: string;
  upstream_curl: string;
  upstream_status?: number;
  upstream_content_type?: string;
  upstream_bytes?: number;
  /** Краткий ответ 1С (без полного base64 PDF). */
  upstream_response_summary?: string;
  access_check?: string;
};

export function buildGetFileUpstreamCurl(upstreamUrl: string, authHeader: string, authorizationHeader: string): string {
  return [
    `curl --location '${upstreamUrl}' \\`,
    `  --header 'Auth: ${authHeader}' \\`,
    `  --header 'Authorization: ${authorizationHeader}' \\`,
    `  --header 'Accept: */*' \\`,
    `  --header 'Accept-Encoding: identity'`,
  ].join("\n");
}

const GET_FILE_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH_BASIC = "Basic YWRtaW46anVlYmZueWU=";
const HAULZ_AUTH_BASIC = "Basic Info@haulz.pro:Y2ME42XyI_";

/** Клиентский ожидаемый curl в 1С (если API не успел вернуть debug / 504 шлюза). */
export function buildExpectedGetFileCurl(params: {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
}): { url: string; curl: string; auth_mode: "haulz" | "service" } {
  const url = new URL(GET_FILE_BASE);
  url.searchParams.set("metod", params.metod);
  url.searchParams.set("Number", params.number);
  if (params.dateDoc) url.searchParams.set("DateDoc", params.dateDoc);
  if (params.dateDog) url.searchParams.set("DateDog", params.dateDog);
  if (params.inn) url.searchParams.set("INN", String(params.inn).trim());
  const auth_mode = isHaulzGetFileMetod(params.metod) ? "haulz" : "service";
  const authHeader =
    auth_mode === "haulz" ? HAULZ_AUTH_BASIC : "Basic <PEREVOZKI_SERVICE_LOGIN>:<PEREVOZKI_SERVICE_PASSWORD>";
  return {
    url: url.toString(),
    auth_mode,
    curl: buildGetFileUpstreamCurl(url.toString(), authHeader, SERVICE_AUTH_BASIC),
  };
}

/** Таймаут ожидания ответа 1С GetFile (мс), чтобы вернуть JSON до 504 шлюза. */
export const GET_FILE_UPSTREAM_TIMEOUT_MS = 90_000;

export function summarizeGetFileUpstreamBody(buffer: Buffer, contentType: string | undefined): string {
  const type = String(contentType ?? "").toLowerCase();
  const head = buffer.slice(0, 4).toString("utf8");
  if (head.startsWith("%PDF")) {
    return `PDF binary, ${buffer.length} bytes, header=${JSON.stringify(buffer.slice(0, 8).toString("latin1"))}`;
  }
  const text = buffer.toString("utf8");
  if (type.includes("json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const clone: Record<string, unknown> = { ...parsed };
      if (typeof clone.data === "string") {
        const dataStr = clone.data;
        clone.data = `<omitted base64/html length=${dataStr.length}>`;
      }
      return JSON.stringify(clone, null, 2).slice(0, 4000);
    } catch {
      /* fall through */
    }
  }
  return text.slice(0, 2000);
}
