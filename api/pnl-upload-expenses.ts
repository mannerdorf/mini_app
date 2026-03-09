import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { parseMultipart } from "./_pnl-multipart.js";
import * as XLSX from "xlsx";
import { initRequestContext, logError } from "./_lib/observability.js";

export const config = { api: { bodyParser: false } };

function parseAmount(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : Math.abs(v);
  if (typeof v === "string") {
    let s = v.trim().replace(/\s/g, "");
    if (!s) return 0;
    s = s.replace(/,(\d{1,3})$/, ".$1");
    const n = parseFloat(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : Math.abs(n);
  }
  return 0;
}

function findCol(row: unknown[], keywords: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] ?? "").toLowerCase();
    if (keywords.some((k) => cell.includes(k))) return i;
  }
  return -1;
}

function findHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] as unknown[];
    if (!row?.length) continue;
    if (findCol(row, ["дата", "date"]) >= 0 && findCol(row, ["сумма", "amount", "стоимость", "итого"]) >= 0) return i;
  }
  return 0;
}

function parseDateDDMMYYYY(s: string): Date | null {
  const m = s?.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_upload_expenses");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });

  try {
    const { fields, files } = await parseMultipart(req);
    const file = files.find((f) => f.fieldName === "file");
    const department = fields.department;
    const logisticsStage = fields.logisticsStage;

    if (!file) return res.status(400).json({ error: "Файл не выбран", request_id: ctx.requestId });
    if (!department) return res.status(400).json({ error: "Не указано подразделение", request_id: ctx.requestId });
    if (!logisticsStage) return res.status(400).json({ error: "Не указан этап логистики", request_id: ctx.requestId });

    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
    if (!data.length) return res.status(400).json({ error: "Пустой файл", request_id: ctx.requestId });

    const hIdx = findHeaderRow(data);
    const header = data[hIdx] as unknown[];
    const dateCol = findCol(header, ["дата", "date"]);
    const amountCol = findCol(header, ["сумма", "amount", "стоимость", "итого", "всего"]);
    const descCol = findCol(header, ["статья", "описание", "наименование", "название", "услуга", "description"]);
    const counterpartyCol = findCol(header, ["контрагент", "поставщик", "исполнитель", "counterparty"]);

    if (dateCol < 0 || amountCol < 0) return res.status(400).json({ error: "Не найдены колонки: дата, сумма", request_id: ctx.requestId });

    let direction: string | null = null;
    if (department === "LOGISTICS_MSK") direction = "MSK_TO_KGD";
    else if (department === "LOGISTICS_KGD") direction = "MSK_TO_KGD";

    const pool = getPool();
    let created = 0;
    let skipped = 0;

    for (let i = hIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length < 2) { skipped++; continue; }

    const amountAbs = parseAmount(row[amountCol]);
    if (amountAbs === 0) { skipped++; continue; }

    let date: Date | null = null;
    const dv = row[dateCol];
    if (dv instanceof Date) date = isNaN(dv.getTime()) ? null : dv;
    else if (typeof dv === "number") {
      const p = XLSX.SSF.parse_date_code(dv) as { y: number; m: number; d: number };
      date = new Date(p.y, p.m - 1, p.d);
    } else date = parseDateDDMMYYYY(String(dv ?? ""));
    if (!date || isNaN(date.getTime())) { skipped++; continue; }

    const description = descCol >= 0 ? String(row[descCol] ?? "").trim() : "";
    const counterparty = counterpartyCol >= 0 ? String(row[counterpartyCol] ?? "").trim() : "";
    const purpose = description || counterparty || "Расход";

      await pool.query(
        `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, logistics_stage, direction)
         VALUES ($1, $2, $3, $4, 'COGS', $5, $6, $7)`,
        [date, counterparty || purpose.slice(0, 100), purpose, -amountAbs, department, logisticsStage, direction]
      );
      created++;
    }

    return res.json({ created, skipped });
  } catch (error) {
    logError(ctx, "pnl_upload_expenses_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка загрузки расходов";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
