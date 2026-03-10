import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export type PvzItem = {
  ВладелецИНН: string;
  ВладелецНаименование: string;
  Ссылка: string;
  Наименование: string;
  КодДляПечати: string;
  РегионНаименование: string;
  ГородНаименование: string;
  КонтактноеЛицо: string;
  ОтправительПолучательНаименование: string;
};

/**
 * GET /api/pvz — справочник ПВЗ из кэша (admin)
 * Кэш обновляется кроном /api/cron/refresh-pvz-cache (раз в сутки) и кнопкой «Обновить из 1С» в админке.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pvz");

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ssylka, naimenovanie, kod_dlya_pechati, gorod, region,
              vladelec_inn, vladelec_naimenovanie, otpravitel_poluchatel, kontaktnoe_litso
       FROM cache_pvz
       ORDER BY sort_order ASC, naimenovanie ASC`
    );
    const pvz: PvzItem[] = rows.map((r: Record<string, string>) => ({
      Ссылка: r.ssylka || "",
      Наименование: r.naimenovanie || "",
      КодДляПечати: r.kod_dlya_pechati || "",
      ГородНаименование: r.gorod || "",
      РегионНаименование: r.region || "",
      ВладелецИНН: r.vladelec_inn || "",
      ВладелецНаименование: r.vladelec_naimenovanie || "",
      ОтправительПолучательНаименование: r.otpravitel_poluchatel || "",
      КонтактноеЛицо: r.kontaktnoe_litso || "",
    }));
    return res.status(200).json({ pvz, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "pvz_fetch_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки ПВЗ",
      request_id: ctx.requestId,
    });
  }
}
