import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();
const normalizeInn = (v: unknown) => String(v ?? "").replace(/\D/g, "").trim();

/**
 * POST /api/pvz-list — ПВЗ, доступные заказчику (по ИНН из account_companies).
 * Требуется авторизация зарегистрированного пользователя.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pvz-list");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const login = normalizeLogin(body?.login ?? req.headers["x-login"]);
  const password = String(body?.password ?? req.headers["x-password"] ?? "").trim();
  const requestedInn = body?.inn ? normalizeInn(body.inn) : null;

  if (!login || !password) {
    return res.status(400).json({ error: "login and password required", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    let filterInns: string[] = [];
    if (verified.accessAllInns) {
      filterInns = requestedInn ? [normalizeInn(requestedInn)] : [];
    } else {
      const acRows = await pool.query<{ inn: string }>(
        "SELECT inn FROM account_companies WHERE login = $1",
        [login]
      );
      const allowed = new Set(
        acRows.rows.map((r) => normalizeInn(r.inn)).filter(Boolean)
      );
      if (verified.inn) allowed.add(normalizeInn(verified.inn));
      filterInns = requestedInn
        ? (allowed.has(requestedInn) ? [requestedInn] : [])
        : Array.from(allowed);
    }

    if (filterInns.length === 0 && !verified.accessAllInns) {
      return res.status(200).json({ pvz: [], request_id: ctx.requestId });
    }

    const geoExclude = "AND lower(naimenovanie) NOT LIKE '%геологистика%'";
    const query =
      filterInns.length === 0
        ? `SELECT ssylka, naimenovanie, kod_dlya_pechati, gorod, region,
                 vladelec_inn, vladelec_naimenovanie, otpravitel_poluchatel, kontaktnoe_litso
          FROM cache_pvz
          WHERE 1=1 ${geoExclude}
          ORDER BY sort_order ASC, naimenovanie ASC`
        : `SELECT ssylka, naimenovanie, kod_dlya_pechati, gorod, region,
                 vladelec_inn, vladelec_naimenovanie, otpravitel_poluchatel, kontaktnoe_litso
          FROM cache_pvz
          WHERE regexp_replace(vladelec_inn, '[^0-9]', '', 'g') = ANY($1::text[])
          ${geoExclude}
          ORDER BY sort_order ASC, naimenovanie ASC`;

    const params = filterInns.length === 0 ? [] : [filterInns];
    const { rows } = await pool.query(query, params);

    const pvz = rows.map((r: Record<string, string>) => {
      const naim = (r.naimenovanie || "").replace(/\s+/g, " ").trim();
      const gorod = (r.gorod || "").replace(/\s+/g, " ").trim();
      return {
        Ссылка: r.ssylka || "",
        Наименование: naim,
        КодДляПечати: r.kod_dlya_pechati || "",
        ГородНаименование: gorod,
        РегионНаименование: r.region || "",
        ВладелецИНН: r.vladelec_inn || "",
        ВладелецНаименование: r.vladelec_naimenovanie || "",
        ОтправительПолучательНаименование: r.otpravitel_poluchatel || "",
        КонтактноеЛицо: r.kontaktnoe_litso || "",
      };
    });

    return res.status(200).json({ pvz, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "pvz_list_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки ПВЗ",
      request_id: ctx.requestId,
    });
  }
}
