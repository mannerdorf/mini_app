import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
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

async function rebuildPolygon(pool: Awaited<ReturnType<typeof getPool>>, cityCode: CityCode) {
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
     from haulz_calc_ring_exits where city_code = $1 and active order by sort_order`,
    [cityCode],
  );
  const ring = ringFromExits(rows);
  await pool.query(`delete from haulz_calc_ring_polygon where city_code = $1`, [cityCode]);
  for (let i = 0; i < ring.length; i++) {
    await pool.query(
      `insert into haulz_calc_ring_polygon (city_code, seq, lat, lon) values ($1, $2, $3, $4)`,
      [cityCode, i, ring[i].lat, ring[i].lon],
    );
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-haulz-calculator-ring");
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const pool = getPool();
  const cityQ = String(req.query.city ?? "").trim().toLowerCase();
  const cityFilter =
    cityQ === "moscow" || cityQ === "kaliningrad" ? (cityQ as CityCode) : undefined;

  try {
    if (req.method === "GET") {
      const params: unknown[] = [];
      let where = "";
      if (cityFilter) {
        params.push(cityFilter);
        where = `where city_code = $1`;
      }
      const { rows } = await pool.query(
        `select id, city_code, code, name, lat, lon, active, sort_order
         from haulz_calc_ring_exits ${where}
         order by city_code, sort_order, id`,
        params,
      );
      return res.status(200).json({ exits: rows, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const cityCode = body.city_code === "kaliningrad" ? "kaliningrad" : "moscow";
      const id = Number(body.id);
      const code = typeof body.code === "string" ? body.code.trim() : null;
      const name = String(body.name ?? "").trim();
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const active = body.active !== false;
      const sortOrder = Number(body.sort_order) || 0;

      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: "name, lat, lon обязательны", request_id: ctx.requestId });
      }

      if (Number.isInteger(id) && id > 0) {
        await pool.query(
          `update haulz_calc_ring_exits set code=$1, name=$2, lat=$3, lon=$4, active=$5, sort_order=$6
           where id=$7 and city_code=$8`,
          [code, name, lat, lon, active, sortOrder, id, cityCode],
        );
      } else {
        await pool.query(
          `insert into haulz_calc_ring_exits (city_code, code, name, lat, lon, active, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [cityCode, code, name, lat, lon, active, sortOrder],
        );
      }
      await rebuildPolygon(pool, cityCode);
      await writeAuditLog(pool, {
        action: "haulz_calc_ring_exit_update",
        target_type: "haulz_calc_ring_exits",
        details: { city_code: cityCode, name },
      });
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id ?? parseBody(req).id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      const { rows } = await pool.query<{ city_code: CityCode }>(
        `delete from haulz_calc_ring_exits where id=$1 returning city_code`,
        [id],
      );
      const cityCode = rows[0]?.city_code;
      if (cityCode) await rebuildPolygon(pool, cityCode);
      return res.status(200).json({ ok: true, deleted: rows.length > 0, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_haulz_calculator_ring_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка",
      request_id: ctx.requestId,
    });
  }
}
