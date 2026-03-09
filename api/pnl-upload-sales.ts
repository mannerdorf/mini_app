import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { parseMultipart } from "./_pnl-multipart.js";
import * as XLSX from "xlsx";
import { initRequestContext, logError } from "./_lib/observability.js";

export const config = { api: { bodyParser: false } };

function findCol(row: unknown[], keywords: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] ?? "").toLowerCase();
    if (keywords.some((k) => cell.includes(k))) return i;
  }
  return -1;
}

function parseNum(v: unknown): number {
  const s = String(v ?? "0").replace(/\s/g, "").replace(/,/g, "");
  return parseFloat(s) || 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_upload_sales");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });

  try {
    const { fields, files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file");
    if (!file) return res.status(400).json({ error: "No file", request_id: ctx.requestId });

    const month = parseInt(fields.month || "1", 10);
    const year = parseInt(fields.year || String(new Date().getFullYear()), 10);
    const date = new Date(year, month - 1, 1).toISOString();

    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    if (!data.length) return res.status(400).json({ error: "Empty file", request_id: ctx.requestId });

    const header = data[0] as unknown[];
    const clientCol = Math.max(0, findCol(header, ["заказчик", "клиент", "client"]));
    const toKgdCol = findCol(header, ["калининград", "кгд", "в кгд"]) >= 0 ? findCol(header, ["калининград", "кгд", "в кгд"]) : 1;
    const toMskCol = findCol(header, ["москва", "мск", "mow", "в мск"]) >= 0 ? findCol(header, ["москва", "мск", "mow", "в мск"]) : 2;

    const pool = getPool();
    let created = 0;

    for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length < 2) continue;
    const client = String(row[clientCol] ?? "").trim();
    const revKgd = parseNum(row[toKgdCol]);
    const revMsk = parseNum(row[toMskCol]);
    if (!client) continue;

      if (revKgd > 0) {
        await pool.query(
          `INSERT INTO pnl_sales (date, client, direction, weight_kg, revenue) VALUES ($1, $2, 'MSK_TO_KGD', 0, $3)`,
          [date, client, revKgd]
        );
        await pool.query(
          `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, direction)
           VALUES ($1, $2, 'Продажи МСК→КГД', $3, 'REVENUE', 'LOGISTICS_MSK', 'MSK_TO_KGD')`,
          [date, client, revKgd]
        );
        created++;
      }
      if (revMsk > 0) {
        await pool.query(
          `INSERT INTO pnl_sales (date, client, direction, weight_kg, revenue) VALUES ($1, $2, 'KGD_TO_MSK', 0, $3)`,
          [date, client, revMsk]
        );
        await pool.query(
          `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, direction)
           VALUES ($1, $2, 'Продажи КГД→МСК', $3, 'REVENUE', 'LOGISTICS_KGD', 'KGD_TO_MSK')`,
          [date, client, revMsk]
        );
        created++;
      }
    }

    return res.json({ created });
  } catch (error) {
    logError(ctx, "pnl_upload_sales_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка загрузки продаж";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
