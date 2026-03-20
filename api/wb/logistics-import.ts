import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PoolClient } from "pg";
import * as XLSX from "xlsx";
import { getPool } from "../_db.js";
import { parseMultipart } from "../_pnl-multipart.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveWbAccess } from "../_wb.js";
import { writeAuditLog } from "../../lib/adminAuditLog.js";
import { parseLogisticsWorksheet } from "./_logisticsXlsx.js";

export const config = { api: { bodyParser: false } };

const UPSERT_SQL = `
insert into wb_logistics_parcel (
  parcel_key,
  perevozka_nasha,
  otchet_dostavki,
  otpavka_ap,
  stoimost,
  logistics_status,
  data_doc,
  data_info_received,
  data_packed,
  data_consolidated,
  data_sent_airport,
  data_departed,
  data_to_hand,
  data_delivered,
  source_filename,
  updated_at
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now()
)
on conflict ((lower(trim(parcel_key)))) do update set
  perevozka_nasha = excluded.perevozka_nasha,
  otchet_dostavki = excluded.otchet_dostavki,
  otpavka_ap = excluded.otpavka_ap,
  stoimost = excluded.stoimost,
  logistics_status = excluded.logistics_status,
  data_doc = excluded.data_doc,
  data_info_received = excluded.data_info_received,
  data_packed = excluded.data_packed,
  data_consolidated = excluded.data_consolidated,
  data_sent_airport = excluded.data_sent_airport,
  data_departed = excluded.data_departed,
  data_to_hand = excluded.data_to_hand,
  data_delivered = excluded.data_delivered,
  source_filename = excluded.source_filename,
  updated_at = now()
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_logistics_import");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let client: PoolClient | null = null;
  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    const { files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file" || f.fieldName === "files");
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    } catch (e) {
      return res.status(400).json({
        error: `Не удалось прочитать файл: ${(e as Error)?.message || "unknown"}`,
        request_id: ctx.requestId,
      });
    }

    const names = wb.SheetNames || [];
    const allRows: ReturnType<typeof parseLogisticsWorksheet> = [];
    for (const name of names) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const part = parseLogisticsWorksheet(ws);
      for (const row of part) allRows.push(row);
    }

    if (allRows.length === 0) {
      return res.status(400).json({
        error:
          "Не найдено строк с колонкой «Посылка». Проверьте, что это тот же формат (первая строка заголовков с «Посылка», «Отчёт о доставке» и т.д.).",
        request_id: ctx.requestId,
      });
    }

    client = await pool.connect();
    let upserted = 0;
    try {
      await client.query("begin");
      for (const row of allRows) {
        await client.query(UPSERT_SQL, [
          row.parcelKey,
          row.perevozkaNasha || null,
          row.otchetDostavki || null,
          row.otpavkaAp || null,
          row.stoimost || null,
          row.logisticsStatus || null,
          row.dataDoc || null,
          row.dataInfoReceived || null,
          row.dataPacked || null,
          row.dataConsolidated || null,
          row.dataSentAirport || null,
          row.dataDeparted || null,
          row.dataToHand || null,
          row.dataDelivered || null,
          file.originalFilename || "upload.xlsx",
        ]);
        upserted += 1;
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
      client = null;
    }

    await writeAuditLog(pool, {
      action: "wb_logistics_import",
      target_type: "wb_logistics_parcel",
      target_id: null,
      details: {
        uploadedBy: access.login,
        filename: file.originalFilename,
        rows: upserted,
      },
    });

    return res.status(200).json({
      ok: true,
      rows: upserted,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_logistics_import_failed", error);
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        // ignore
      }
      try {
        client.release();
      } catch {
        // ignore
      }
    }
    return res.status(500).json({ error: "Ошибка импорта логистики", request_id: ctx.requestId });
  }
}
