import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists, resolveHaulzReturnsAccess } from "../_haulzReturns.js";
import { carrierFromDbRow, parseCarrierInput } from "../../lib/haulzReturns/carriers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_carriers");
  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_carriers"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/082_haulz_carriers.sql",
      request_id: ctx.requestId,
    });
  }

  try {
    if (req.method === "GET") {
      const { rows } = await pool.query<{
        id: string;
        name: string;
        legal_address: string;
        inn: string;
        kpp: string;
        loading_address: string;
        unloading_address: string;
        created_at: string;
        updated_at: string;
      }>(
        `select id::text, name, legal_address, inn, kpp, loading_address, unloading_address, created_at, updated_at
         from haulz_carriers
         order by lower(name) asc, id asc`,
      );
      return res.status(200).json({
        carriers: rows.map(carrierFromDbRow),
        request_id: ctx.requestId,
      });
    }

    if (req.method === "POST") {
      const input = parseCarrierInput(req.body);
      if (!input) {
        return res.status(400).json({ error: "Укажите название перевозчика", request_id: ctx.requestId });
      }
      const { rows } = await pool.query<{
        id: string;
        name: string;
        legal_address: string;
        inn: string;
        kpp: string;
        loading_address: string;
        unloading_address: string;
        created_at: string;
        updated_at: string;
      }>(
        `insert into haulz_carriers (name, legal_address, inn, kpp, loading_address, unloading_address, created_by_login)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id::text, name, legal_address, inn, kpp, loading_address, unloading_address, created_at, updated_at`,
        [
          input.name,
          input.legalAddress,
          input.inn,
          input.kpp,
          input.loadingAddress,
          input.unloadingAddress,
          access.loginKey,
        ],
      );
      return res.status(201).json({
        carrier: carrierFromDbRow(rows[0]!),
        request_id: ctx.requestId,
      });
    }

    if (req.method === "PATCH") {
      const carrierId = Number(req.query.carrierId ?? req.body?.carrierId);
      if (!Number.isFinite(carrierId) || carrierId <= 0) {
        return res.status(400).json({ error: "Укажите carrierId", request_id: ctx.requestId });
      }
      const input = parseCarrierInput(req.body);
      if (!input) {
        return res.status(400).json({ error: "Укажите данные перевозчика", request_id: ctx.requestId });
      }
      const { rows } = await pool.query<{
        id: string;
        name: string;
        legal_address: string;
        inn: string;
        kpp: string;
        loading_address: string;
        unloading_address: string;
        created_at: string;
        updated_at: string;
      }>(
        `update haulz_carriers
         set name = $2,
             legal_address = $3,
             inn = $4,
             kpp = $5,
             loading_address = $6,
             unloading_address = $7,
             updated_at = now()
         where id = $1
         returning id::text, name, legal_address, inn, kpp, loading_address, unloading_address, created_at, updated_at`,
        [
          carrierId,
          input.name,
          input.legalAddress,
          input.inn,
          input.kpp,
          input.loadingAddress,
          input.unloadingAddress,
        ],
      );
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ error: "Перевозчик не найден", request_id: ctx.requestId });
      }
      return res.status(200).json({
        carrier: carrierFromDbRow(row),
        request_id: ctx.requestId,
      });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_returns_carriers_failed", e);
    return res.status(500).json({ error: "Ошибка сервера", request_id: ctx.requestId });
  }
}
