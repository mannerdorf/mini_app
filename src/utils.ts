import type { CustomerOption, CompanyRow } from "./types";
import { decodeBase64Payload, normalizeBase64Payload } from "../lib/base64Document.js";
import { CapacitorHttp } from "@capacitor/core";
import { toAbsoluteApiUrl } from "./lib/absoluteApiUrl";
import { isCapacitorNative } from "./lib/capacitorPlatform";

export { decodeBase64Payload, normalizeBase64Payload };

/** Читает ответ как JSON или текст по content-type */
export async function readJsonOrText(res: Response): Promise<any> {
    const contentType = res.headers.get("content-type") || "";
    try {
        if (contentType.includes("application/json")) return await res.json();
    } catch { /* ignore */ }
    try {
        const text = await res.text();
        return text;
    } catch {
        return null;
    }
}

/** Человекочитаемые сообщения по HTTP-коду */
export function humanizeStatus(status: number): string {
    if (status === 400) return "Неверный запрос. Проверьте данные.";
    if (status === 401 || status === 403) return "Неверный логин или пароль.";
    if (status === 404) return "Данные не найдены.";
    if (status === 408) return "Превышено время ожидания. Повторите попытку.";
    if (status === 429) return "Слишком много попыток. Попробуйте позже.";
    if (status >= 500) return "Ошибка сервера. Попробуйте позже.";
    return "Не удалось выполнить запрос. Попробуйте позже.";
}

/** Извлекает текст ошибки из ответа (без служебных символов JSON). Учитывает 1С: { Success, Error }. */
export function extractErrorMessage(payload: unknown): string {
    if (payload == null) return "";
    if (typeof payload === "object") {
        const o = payload as Record<string, unknown>;
        const text = (o.Error ?? o.error ?? o.message) as string | undefined;
        return typeof text === "string" && text.trim() ? text.trim() : "";
    }
    if (typeof payload === "string") {
        const s = payload.trim();
        if (!s) return "";
        try {
            const parsed = JSON.parse(s) as Record<string, unknown>;
            const text = (parsed.Error ?? parsed.error ?? parsed.message) as string | undefined;
            return typeof text === "string" && text.trim() ? text.trim() : "";
        } catch {
            return s;
        }
    }
    return "";
}

/** Бросает Error с понятным сообщением, если !res.ok */
export async function ensureOk(res: Response, fallback?: string): Promise<void> {
    if (res.ok) return;
    const payload = await readJsonOrText(res);
    const safe = extractErrorMessage(payload)
        || (typeof payload === "string" && payload.trim() ? payload.trim() : "");
    const message =
        res.status === 404 ? "Данные не найдены." :
        res.status >= 500 ? "Ошибка сервера. Попробуйте позже." :
        safe || fallback || humanizeStatus(res.status);
    throw new Error(message);
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

function requestHeaders(init?: RequestInit): Record<string, string> {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (!raw) return headers;
    if (raw instanceof Headers) {
        raw.forEach((value, key) => {
            headers[key] = value;
        });
        return headers;
    }
    if (Array.isArray(raw)) {
        raw.forEach(([key, value]) => {
            headers[key] = value;
        });
        return headers;
    }
    return { ...raw };
}

function requestBodyString(init?: RequestInit): string {
    const body = init?.body;
    if (body == null) return "";
    if (typeof body === "string") return body;
    return String(body);
}

/** Получить сообщение об ошибке из ответа для показа пользователю */
async function getErrorMessageFromResponse(res: Response, fallback?: string): Promise<string> {
    const payload = await readJsonOrText(res);
    const safe = extractErrorMessage(payload)
        || (typeof payload === "string" && payload.trim() ? payload.trim() : "");
    return safe || fallback || humanizeStatus(res.status);
}

/** Таймаут клиентских запросов к API (серверные функции до 300 с). */
export const API_FETCH_TIMEOUT_MS = 90_000;

const humanizeNetworkError = (error: unknown): Error => {
    if (!(error instanceof Error)) return new Error("Не удалось выполнить запрос. Проверьте интернет.");
    const lower = error.message.toLowerCase();
    if (
        lower.includes("network connection was lost") ||
        lower.includes("the internet connection appears to be offline") ||
        lower.includes("network error") ||
        lower.includes("load failed") ||
        lower.includes("failed to fetch")
    ) {
        return new Error("Нет связи с сервером. Проверьте интернет и повторите.");
    }
    return error;
};

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (init?.signal) return fetch(input, init);
    // CapacitorHttp + AbortController на iOS даёт «network connection was lost»
    if (isCapacitorNative()) return fetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function capacitorPostJson<T>(url: string, headers: Record<string, string>, body: string): Promise<T> {
    const absoluteUrl = toAbsoluteApiUrl(url);
    try {
        const res = await CapacitorHttp.post({
            url: absoluteUrl,
            headers: { ...headers, "Content-Type": "application/json" },
            data: body ? JSON.parse(body) : {},
            connectTimeout: API_FETCH_TIMEOUT_MS,
            readTimeout: API_FETCH_TIMEOUT_MS,
        });
        if (res.status < 200 || res.status >= 300) {
            throw new Error(extractErrorMessage(res.data) || humanizeStatus(res.status));
        }
        return (res.data ?? {}) as T;
    } catch (e) {
        throw humanizeNetworkError(e);
    }
}

/**
 * Единая обёртка над fetch: при !res.ok бросает Error с текстом от сервера (error/message)
 * или человекочитаемым сообщением по коду. Возвращает Response при успехе.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
        res = await fetchWithTimeout(input, init);
    } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
            throw new Error("Превышено время ожидания. Повторите попытку.");
        }
        throw humanizeNetworkError(e);
    }
    if (!res.ok) {
        const message = await getErrorMessageFromResponse(res);
        throw new Error(message);
    }
    return res;
}

/**
 * То же, что apiFetch, но парсит тело как JSON и возвращает его. Удобно для API, возвращающих JSON.
 * При !res.ok бросает Error с сообщением от сервера для показа пользователю.
 */
export async function apiFetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const method = String(init?.method || "GET").toUpperCase();
    if (isCapacitorNative() && method === "POST") {
        return capacitorPostJson<T>(requestUrl(input), requestHeaders(init), requestBodyString(init));
    }

    let res: Response;
    try {
        res = await fetchWithTimeout(input, init);
    } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
            throw new Error("Превышено время ожидания. Повторите попытку.");
        }
        throw humanizeNetworkError(e);
    }
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    if (!res.ok) {
        const message = await getErrorMessageFromResponse(res);
        throw new Error(message);
    }
    if (!isJson) return {} as T;
    try {
        return await res.json() as T;
    } catch {
        return {} as T;
    }
}

/** Заказчик из ответа GetPerevozki (первая запись с Customer) */
export function extractCustomerFromPerevozki(payload: any): string | null {
    const list = Array.isArray(payload) ? payload : payload?.items || [];
    if (!Array.isArray(list)) return null;
    const item = list.find((entry: any) => entry?.Customer || entry?.customer);
    const customer = item?.Customer ?? item?.customer;
    return customer ? String(customer) : null;
}

/** ИНН из ответа GetPerevozki (из той же записи, что и Customer) */
export function extractInnFromPerevozki(payload: any): string | null {
    const list = Array.isArray(payload) ? payload : payload?.items || [];
    if (!Array.isArray(list)) return null;
    const item = list.find((entry: any) => entry?.Customer || entry?.customer);
    const inn = (item?.INN ?? item?.Inn ?? "").toString().trim();
    return inn.length > 0 ? inn : null;
}

/** Список ИНН, уже добавленных в «Мои компании» для данных логинов */
export async function getExistingInns(logins: string[]): Promise<Set<string>> {
    if (logins.length === 0) return new Set();
    const query = logins.map((l) => `login=${encodeURIComponent(l.trim().toLowerCase())}`).join("&");
    const r = await fetch(`/api/companies?${query}`);
    const data = await r.json().catch(() => ({}));
    const list = Array.isArray(data?.companies) ? data.companies : [];
    const inns = new Set<string>();
    for (const c of list) {
        const inn = (c?.inn ?? "").toString().trim();
        if (inn.length > 0) inns.add(inn);
    }
    return inns;
}

/** Одна компания на одно название (для списка компаний/заказчиков). Приоритет — строка с непустым ИНН. */
export function dedupeCompaniesByName(rows: CompanyRow[]): CompanyRow[] {
    const byName = new Map<string, CompanyRow>();
    const normalize = (s: string) => (s || "").trim().toLowerCase();
    for (const c of rows) {
        const key = normalize(c.name);
        if (!key) continue;
        const existing = byName.get(key);
        if (!existing) {
            byName.set(key, c);
        } else {
            const hasInn = (c.inn || "").trim().length > 0;
            const existingHasInn = (existing.inn || "").trim().length > 0;
            if (hasInn && !existingHasInn) byName.set(key, c);
        }
    }
    return Array.from(byName.values());
}

/** Один заказчик на один ИНН; при дубликатах оставляем запись с более длинным name */
export function dedupeCustomersByInn(list: CustomerOption[]): CustomerOption[] {
    const byInn = new Map<string, CustomerOption>();
    for (const c of list) {
        const key = c.inn.length > 0 ? c.inn : `__empty_${c.name}`;
        if (!byInn.has(key)) {
            byInn.set(key, c);
        } else {
            const existing = byInn.get(key)!;
            if ((c.name?.length ?? 0) > (existing.name?.length ?? 0)) {
                byInn.set(key, c);
            }
        }
    }
    return Array.from(byInn.values());
}

/**
 * Скачать файл из ответа API download (base64 data).
 * PDF — скачивается как есть.
 * HTML (Договор от 1С) — по умолчанию конвертируется в PDF через html2pdf.js.
 */
export async function downloadBase64File(payload: {
    data: string;
    name?: string;
    isHtml?: boolean;
    convertHtmlToPdf?: boolean;
}): Promise<void> {
    const { data, name = "document", isHtml, convertHtmlToPdf = true } = payload;
    const isHtmlFile = Boolean(isHtml) || /\.html?$/i.test(String(name));
    let bytes: Uint8Array;
    try {
        bytes = decodeBase64Payload(String(data));
    } catch {
        throw new Error("Не удалось расшифровать документ");
    }

    if (isHtmlFile && convertHtmlToPdf) {
        const htmlStr = new TextDecoder("utf-8").decode(bytes);
        const pdfName = String(name).replace(/\.html?$/i, "") + ".pdf";
        const html2pdf = (await import("html2pdf.js")).default;
        await html2pdf()
            .set({ filename: pdfName, margin: 8, image: { type: "jpeg", quality: 0.95 } })
            .from(htmlStr, "string")
            .save();
        return;
    }

    const mime = isHtmlFile ? "text/html;charset=utf-8" : "application/pdf";
    const blob = new Blob([bytes], { type: mime });
    const { saveBlobFile } = await import("./lib/saveBlobFile");
    await saveBlobFile(blob, String(name));
}

/** Декодирование base64url в Uint8Array (для Web Push VAPID key) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}
