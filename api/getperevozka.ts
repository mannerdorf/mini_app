import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { normalizePerevozkaSteps } from "./lib/postbGetapiNormalize.js";

const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const GET_PEREVOZKA_METHODS = ["Getperevozka", "GetPerevozka"] as const;
/** Таймаут одного запроса в 1С (maxDuration функции = 60 с). */
const UPSTREAM_TIMEOUT_MS = 45_000;

const TIMELINE_ARRAY_KEYS = [
  "items",
  "Items",
  "Steps",
  "stages",
  "Statuses",
  "statuses",
  "Статусы",
  "статусы",
  "History",
  "history",
  "История",
  "история",
] as const;

function extractTimelineFromJson(json: unknown): unknown[] | null {
  if (!json || typeof json !== "object") return null;
  if (Array.isArray(json)) return json;
  const record = json as Record<string, unknown>;
  for (const key of TIMELINE_ARRAY_KEYS) {
    const val = record[key];
    if (Array.isArray(val) && val.length > 0) return val;
  }
  for (const nest of ["Response", "Data", "Result", "result", "data"]) {
    const nested = record[nest];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    for (const key of TIMELINE_ARRAY_KEYS) {
      const val = (nested as Record<string, unknown>)[key];
      if (Array.isArray(val) && val.length > 0) return val;
    }
  }
  return null;
}

function isMeaningfulTimelineStep(step: { title: string; date: string }): boolean {
  const title = String(step.title ?? "").trim();
  return title !== "" && title !== "—" && title !== "-";
}

/** Добавляет items[] из эвристики 1С, если в ответе ещё нет шагов таймлайна. */
function attachNormalizedSteps(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  const hasSteps = TIMELINE_ARRAY_KEYS.some((key) => {
    const val = record[key];
    return Array.isArray(val) && val.length > 0;
  });
  if (hasSteps) return payload;
  const norm = normalizePerevozkaSteps(payload).filter(isMeaningfulTimelineStep);
  if (norm.length === 0) return payload;
  return {
    ...record,
    items: norm.map((s) => ({ Stage: s.title, Date: s.date })),
  };
}

async function fetchUpstreamWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Варианты номера для 1С: с ведущими нулями и без (как в sendings-plan-date) */
function normalizePerevozkaNumberForLookup(num: string): string {
  const trimmed = String(num).trim();
  const digits = trimmed.replace(/^0000-/, "").replace(/\D/g, "");
  if (!digits) return trimmed;
  const core = digits.replace(/^0+/, "") || digits;
  if (/^\d{1,9}$/.test(core)) return core.padStart(9, "0");
  return trimmed;
}

function perevozkaNumbersMatch(a: string, b: string): boolean {
  const left = normalizePerevozkaNumberForLookup(a);
  const right = normalizePerevozkaNumberForLookup(b);
  if (left === right) return true;
  const strip = (s: string) => {
    const d = s.replace(/^0000-/, "").replace(/\D/g, "");
    return (d.replace(/^0+/, "") || d).trim();
  };
  return strip(a) === strip(b);
}

function hasPerevozkaCargoFields(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  const keys = ["Number", "number", "Номер", "Mest", "mest", "Sender", "sender", "Customer", "customer", "Receiver", "receiver", "DatePrih", "datePrih", "State", "state"];
  return keys.some((key) => {
    const value = record[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function numberVariants(num: string): string[] {
  const trimmed = String(num).trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return [trimmed];
  const out = [trimmed];
  const digitsNoLead = digits.replace(/^0+/, "") || digits;
  if (digitsNoLead !== trimmed) out.push(digitsNoLead);
  if (digits.length > 0 && digits.length < 9) out.push(digits.padStart(9, "0"));
  return [...new Set(out)];
}

async function requestGetPerevozkaFrom1C(params: {
  number: string;
  inn?: string;
  serviceLogin: string;
  servicePassword: string;
}) {
  let lastStatus = 504;
  let lastText = "Upstream timeout";
  for (const methodName of GET_PEREVOZKA_METHODS) {
    const url = new URL(GETAPI_BASE);
    url.searchParams.set("metod", methodName);
    url.searchParams.set("Number", params.number);
    if (params.inn && String(params.inn).trim()) {
      url.searchParams.set("INN", String(params.inn).trim());
    }
    try {
      const upstream = await fetchUpstreamWithTimeout(url.toString(), {
        method: "GET",
        headers: {
          Auth: `Basic ${params.serviceLogin}:${params.servicePassword}`,
          Authorization: SERVICE_AUTH,
          Accept: "application/json",
        },
      });
      const text = await upstream.text();
      lastStatus = upstream.status;
      lastText = text;
      if (upstream.ok) {
        return { ok: true as const, status: upstream.status, text };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastStatus = 504;
      lastText = msg.includes("abort") ? "Upstream timeout" : msg;
    }
  }
  return { ok: false as const, status: lastStatus, text: lastText };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "getperevozka");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let login: string | undefined;
  let password: string | undefined;
  let number: string | undefined;
  let inn: string | undefined;
  const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN;
  const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD;

  let isRegisteredUser = false;
  if (req.method === "GET") {
    login = typeof req.query.login === "string" ? req.query.login : undefined;
    password =
      typeof req.query.password === "string" ? req.query.password : undefined;
    number =
      typeof req.query.number === "string" ? req.query.number : undefined;
    inn = typeof req.query.inn === "string" ? req.query.inn : undefined;
    isRegisteredUser = req.query.isRegisteredUser === "true";
  } else {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
      }
    }
    ({ login, password, number, inn, isRegisteredUser } = body ?? {});
  }

  if (!number) {
    return res.status(400).json({
      error: "Required: number",
      request_id: ctx.requestId,
    });
  }
  number = normalizePerevozkaNumberForLookup(number);
  if (!serviceLogin || !servicePassword) {
    return res.status(503).json({
      error: "Service credentials are not configured",
      message: "Set PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD in Vercel.",
      request_id: ctx.requestId,
    });
  }
  if (isRegisteredUser && (!login || !password)) {
    return res.status(400).json({
      error: "Required for registered user: login, password, number",
      request_id: ctx.requestId,
    });
  }

  if (!/^[0-9A-Za-zА-Яа-я._-]{1,64}$/u.test(number)) {
    return res.status(400).json({ error: "Invalid number", request_id: ctx.requestId });
  }

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login!, password!);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
      }
      const cacheRow = await pool.query<{ data: unknown[] }>(
        "SELECT data FROM cache_perevozki WHERE id = 1"
      );
      const data = cacheRow.rows.length > 0 ? (cacheRow.rows[0].data as any[]) : [];
      const list = Array.isArray(data) ? data : [];
      const norm = String(number).trim();
      const item = list.find((i: any) => {
        const n = String(i?.Number ?? i?.number ?? "").trim();
        if (!n) return false;
        if (!perevozkaNumbersMatch(n, norm)) return false;
        if (verified.accessAllInns) return true;
        const itemInn = String(i?.INN ?? i?.Inn ?? i?.inn ?? "").trim();
        return itemInn === (verified.inn ?? "");
      });
      const itemInn = item ? String(item?.INN ?? item?.Inn ?? item?.inn ?? "").trim() : "";
      const innFor1C = itemInn || (verified.inn ?? "").trim() || (inn && String(inn).trim()) || undefined;
      let upstream = await requestGetPerevozkaFrom1C({
        number: norm,
        inn: innFor1C,
        serviceLogin,
        servicePassword,
      });
      if (!upstream.ok && !item) {
        const variants = numberVariants(norm).filter((v) => v !== norm);
        for (const alt of variants) {
          upstream = await requestGetPerevozkaFrom1C({
            number: alt,
            inn: innFor1C,
            serviceLogin,
            servicePassword,
          });
          if (upstream.ok) break;
        }
      }
      if (upstream.ok) {
        const text = upstream.text;
        try {
          const json = JSON.parse(text);
          if (item && !hasPerevozkaCargoFields(json)) {
            const steps = extractTimelineFromJson(json);
            if (steps) {
              return res.status(200).json({ ...(item as Record<string, unknown>), items: steps });
            }
            return res.status(200).json(attachNormalizedSteps(item));
          }
          return res.status(200).json(attachNormalizedSteps(json));
        } catch {
          return res.status(200).send(text);
        }
      }
      if (!item) {
        return res.status(404).json({ error: "Перевозка не найдена", request_id: ctx.requestId });
      }
      return res.status(200).json(attachNormalizedSteps(item));
    } catch (e) {
      logError(ctx, "getperevozka_registered_user_failed", e);
      return res.status(500).json({ error: "Ошибка запроса", request_id: ctx.requestId });
    }
  }

  try {
    let upstream = await requestGetPerevozkaFrom1C({
      number,
      inn,
      serviceLogin,
      servicePassword,
    });
    if (!upstream.ok) {
      const variants = numberVariants(number).filter((v) => v !== number);
      for (const alt of variants) {
        upstream = await requestGetPerevozkaFrom1C({
          number: alt,
          inn,
          serviceLogin,
          servicePassword,
        });
        if (upstream.ok) break;
      }
    }
    const text = upstream.text;

    if (!upstream.ok) {
      try {
        const errJson = JSON.parse(text);
        if (errJson && typeof errJson === "object" && !Array.isArray(errJson)) {
          return res.status(upstream.status).json({ ...(errJson as Record<string, unknown>), request_id: ctx.requestId });
        }
        return res.status(upstream.status).json({ error: String(errJson), request_id: ctx.requestId });
      } catch {
        return res
          .status(upstream.status)
          .json({ error: text || `Upstream error: ${upstream.status}`, request_id: ctx.requestId });
      }
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(attachNormalizedSteps(json));
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: any) {
    logError(ctx, "getperevozka_proxy_failed", e);
    return res
      .status(500)
      .json({ error: "Proxy error", details: e?.message || String(e), request_id: ctx.requestId });
  }
}
