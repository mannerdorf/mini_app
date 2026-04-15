import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { mergeBillUpdIntoItems } from "../lib/perevozkaBillUpdDb.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const GET_PEREVOZKA_METHODS = ["Getperevozka", "GetPerevozka"] as const;

/** Варианты номера для 1С: с ведущими нулями и без (как в sendings-plan-date) */
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
  let lastStatus = 500;
  let lastText = "";
  for (const methodName of GET_PEREVOZKA_METHODS) {
    const url = new URL(GETAPI_BASE);
    url.searchParams.set("metod", methodName);
    url.searchParams.set("Number", params.number);
    if (params.inn && String(params.inn).trim()) {
      url.searchParams.set("INN", String(params.inn).trim());
    }
    const upstream = await fetch(url.toString(), {
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
  }
  return { ok: false as const, status: lastStatus, text: lastText };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
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
      const normForCompare = norm.replace(/^0+/, "") || norm;
      const item = list.find((i: any) => {
        const n = String(i?.Number ?? i?.number ?? "").trim();
        const nForCompare = n.replace(/^0+/, "") || n;
        if (nForCompare !== normForCompare && n !== norm) return false;
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
          try {
            const pool = getPool();
            return res.status(200).json(await enrichGetPerevozkaPayload(pool, json));
          } catch {
            return res.status(200).json(json);
          }
        } catch {
          return res.status(200).send(text);
        }
      }
      if (!item) {
        return res.status(404).json({ error: "Перевозка не найдена", request_id: ctx.requestId });
      }
      try {
        const pool = getPool();
        const copy = { ...item };
        await mergeBillUpdIntoItems(pool, [copy]);
        return res.status(200).json(copy);
      } catch {
        return res.status(200).json(item);
      }
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
      try {
        const pool = getPool();
        return res.status(200).json(await enrichGetPerevozkaPayload(pool, json));
      } catch {
        return res.status(200).json(json);
      }
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
