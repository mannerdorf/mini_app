import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

/**
 * Строка вида `$1:1:3820740543:120762` — предпоследнее поле через «:» = номер короба;
 * в колонку «ШК короба» пишется вся строка целиком (как в файле).
 * Короткий формат `3820740543:120762` — в БД уйдёт полная строка, короб по-прежнему предпоследний сегмент.
 */
export function parseInboundBoxShkText(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(":").map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length < 2) continue;
    const box = parts[parts.length - 2]!;
    if (!box) continue;
    map.set(box, line);
  }
  return map;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_inbound_box_shk_upload");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_inbound_items"))) {
      return res.status(400).json({ error: "Таблица ввозных описей не найдена", request_id: ctx.requestId });
    }

    const colCheck = await pool.query<{ e: boolean }>(
      `select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'wb_inbound_items' and column_name = 'box_shk'
      ) as e`,
    );
    if (!colCheck.rows[0]?.e) {
      return res.status(503).json({
        error: "Выполните миграцию migrations/058_wb_inbound_box_shk.sql (колонка box_shk).",
        request_id: ctx.requestId,
      });
    }

    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const text = String(body.text ?? "").replace(/^\uFEFF/, "");
    const pairs = parseInboundBoxShkText(text);
    if (pairs.size === 0) {
      return res.status(400).json({
        error: "Нет строк с минимум двумя полями через «:» (предпоследнее — номер короба, в БД пишется вся строка).",
        request_id: ctx.requestId,
      });
    }

    const entries = [...pairs.entries()];
    const CHUNK = 150;
    let updated = 0;
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (let i = 0; i < entries.length; i += CHUNK) {
        const slice = entries.slice(i, i + CHUNK);
        const vals: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const [box, shk] of slice) {
          vals.push(`($${p++}::text, $${p++}::text)`);
          params.push(box, shk);
        }
        const upd = await client.query(
          `with v(box_num, shk_val) as (values ${vals.join(", ")})
           update wb_inbound_items i
           set box_shk = v.shk_val, updated_at = now()
           from v
           where trim(i.box_number) = trim(v.box_num)
           returning i.id`,
          params,
        );
        updated += upd.rowCount ?? 0;
      }
      await client.query("commit");
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    await writeAuditLog(pool, {
      action: "wb_inbound_box_shk_upload",
      target_type: "wb_inbound_items",
      target_id: null,
      details: {
        pairsInFile: pairs.size,
        rowsUpdated: updated,
        uploadedBy: access.login,
      },
    });

    return res.status(200).json({
      ok: true,
      pairsInFile: pairs.size,
      rowsUpdated: updated,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_inbound_box_shk_upload_failed", error);
    return res.status(500).json({ error: "Ошибка применения ШК коробов", request_id: ctx.requestId });
  }
}
