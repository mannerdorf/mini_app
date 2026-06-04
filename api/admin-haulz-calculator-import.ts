import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { parseMkadExitsFromMoxcel, parseMoxcelCells } from "../lib/haulzCalculator/moxcelParser.js";
import { parsePickupXlsxBuffer } from "../lib/haulzCalculator/pickupXlsxParser.js";
import { ringFromExits } from "../lib/haulzCalculator/mkadDistance.js";
import type { CityCode } from "../lib/haulzCalculator/types.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

async function upsertPickupVersion(
  pool: Awaited<ReturnType<typeof getPool>>,
  code: "pickup_matrix" | "last_mile_matrix",
  payload: unknown,
  effectiveFrom: string,
) {
  const { rows } = await pool.query<{ id: string }>(
    `select id::text from haulz_calc_tariff_sets where code = $1`,
    [code],
  );
  const setId = Number(rows[0]?.id);
  if (!setId) throw new Error(`tariff set ${code} не найден — выполните seed`);
  await pool.query(
    `insert into haulz_calc_tariff_versions (tariff_set_id, effective_from, payload, created_by, comment)
     values ($1, $2::date, $3::jsonb, 'admin_import', 'import xlsx')
     on conflict (tariff_set_id, effective_from) do update set payload = excluded.payload`,
    [setId, effectiveFrom, JSON.stringify(payload)],
  );
}

function buildPickupPayload(
  scope: "pickup" | "last_mile",
  parsed: { moscow: unknown[]; kaliningrad: unknown[]; note?: string },
) {
  return {
    scope,
    note: parsed.note,
    cities: {
      moscow: { tiers: parsed.moscow, ring_label: "МКАД" },
      kaliningrad: { tiers: parsed.kaliningrad, ring_label: "КАД" },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-haulz-calculator-import");
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseBody(req);
  const kind = String(body.kind ?? "").trim();
  const b64 = String(body.content_base64 ?? body.file_base64 ?? "").trim();
  const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body.effective_from ?? ""))
    ? String(body.effective_from)
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

  if (!b64) {
    return res.status(400).json({ error: "content_base64 обязателен", request_id: ctx.requestId });
  }

  const pool = getPool();
  const buf = Buffer.from(b64, "base64");

  try {
    if (kind === "pickup_xlsx") {
      const parsed = parsePickupXlsxBuffer(buf);
      if (!parsed) {
        return res.status(400).json({ error: "Не удалось разобрать xlsx", request_id: ctx.requestId });
      }
      await upsertPickupVersion(pool, "pickup_matrix", buildPickupPayload("pickup", parsed), effectiveFrom);
      await upsertPickupVersion(pool, "last_mile_matrix", buildPickupPayload("last_mile", parsed), effectiveFrom);
      await writeAuditLog(pool, {
        action: "haulz_calc_import_pickup",
        target_type: "haulz_calc_tariff_version",
        details: { effective_from: effectiveFrom, tiers_moscow: parsed.moscow.length },
      });
      return res.status(200).json({
        ok: true,
        imported: { moscow_tiers: parsed.moscow.length, kaliningrad_tiers: parsed.kaliningrad.length },
        request_id: ctx.requestId,
      });
    }

    if (kind === "mkad_mxl") {
      const cells = parseMoxcelCells(buf.toString("utf8"));
      const exits = parseMkadExitsFromMoxcel(cells);
      await pool.query(`delete from haulz_calc_ring_exits where city_code = 'moscow'`);
      let order = 0;
      for (const e of exits) {
        await pool.query(
          `insert into haulz_calc_ring_exits (city_code, code, name, lat, lon, active, sort_order)
           values ('moscow', $1, $2, $3, $4, true, $5)`,
          [e.code, e.name, e.lat, e.lon, order++],
        );
      }
      const { rows } = await pool.query<{
        id: number;
        city_code: CityCode;
        code: string | null;
        name: string;
        lat: number;
        lon: number;
        active: boolean;
        sort_order: number;
      }>(
        `select id, city_code, code, name, lat::float8 as lat, lon::float8 as lon, active, sort_order
         from haulz_calc_ring_exits where city_code = 'moscow' and active`,
      );
      const ring = ringFromExits(rows);
      await pool.query(`delete from haulz_calc_ring_polygon where city_code = 'moscow'`);
      for (let i = 0; i < ring.length; i++) {
        await pool.query(
          `insert into haulz_calc_ring_polygon (city_code, seq, lat, lon) values ('moscow', $1, $2, $3)`,
          [i, ring[i].lat, ring[i].lon],
        );
      }
      await writeAuditLog(pool, {
        action: "haulz_calc_import_mkad",
        target_type: "haulz_calc_ring_exits",
        details: { count: exits.length },
      });
      return res.status(200).json({ ok: true, imported: { mkad_exits: exits.length }, request_id: ctx.requestId });
    }

    return res.status(400).json({
      error: "kind: pickup_xlsx | mkad_mxl",
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "admin_haulz_calculator_import_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка импорта",
      request_id: ctx.requestId,
    });
  }
}
