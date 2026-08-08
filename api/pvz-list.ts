import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * POST /api/pvz-list — справочник ПВЗ для заявок (из cache_pvz).
 * Требуется авторизация зарегистрированного пользователя.
 *
 * ВладелецИНН в 1С — это владелец пункта (логистический партнёр), а не заказчик.
 * Список общий для всех авторизованных пользователей; фильтр по городу — на клиенте.
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

  if (!login || !password) {
    return res.status(400).json({ error: "login and password required", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    const geoExclude = "AND lower(naimenovanie) NOT LIKE '%геологистика%'";
    const zelenoeExclude =
      "AND lower(coalesce(naimenovanie,'') || ' ' || coalesce(gorod,'') || ' ' || coalesce(region,'')) NOT LIKE '%зеленое шоссе%'" +
      " AND lower(coalesce(naimenovanie,'') || ' ' || coalesce(gorod,'') || ' ' || coalesce(region,'')) NOT LIKE '%зелёное шоссе%'";
    const haulzWarehouseExclude =
      "AND lower(coalesce(naimenovanie,'') || ' ' || coalesce(gorod,'') || ' ' || coalesce(region,'') || ' ' || coalesce(otpravitel_poluchatel,'')) NOT LIKE '%андреевск%'" +
      " AND lower(coalesce(naimenovanie,'') || ' ' || coalesce(gorod,'') || ' ' || coalesce(region,'') || ' ' || coalesce(otpravitel_poluchatel,'')) NOT LIKE '%железнодорожн%12%'";

    const { rows } = await pool.query(
      `SELECT ssylka, naimenovanie, kod_dlya_pechati, gorod, region,
              vladelec_inn, vladelec_naimenovanie, otpravitel_poluchatel, kontaktnoe_litso
       FROM cache_pvz
       WHERE 1=1 ${geoExclude} ${zelenoeExclude} ${haulzWarehouseExclude}
       ORDER BY sort_order ASC, naimenovanie ASC`,
    );

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
