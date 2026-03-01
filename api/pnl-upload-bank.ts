import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { parseMultipart } from "./_pnl-multipart.js";
import * as XLSX from "xlsx";

export const config = { api: { bodyParser: false } };

function parseAmount(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "string") {
    let s = v.trim().replace(/\s/g, "");
    if (!s) return 0;
    s = s.replace(/,(\d{1,3})$/, ".$1");
    const n = parseFloat(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
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
    if (findCol(row, ["дата проведения", "дата"]) >= 0 && findCol(row, ["сумма в валюте счёта", "сумма", "amount"]) >= 0) return i;
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { files } = await parseMultipart(req);
  const file = files.find((f) => f.fieldName === "file");
  if (!file) return res.status(400).json({ error: "No file" });

  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
  if (!data.length) return res.status(400).json({ error: "Empty file" });

  const hIdx = findHeaderRow(data);
  const header = data[hIdx] as unknown[];
  const dateCol = findCol(header, ["дата проведения", "дата"]);
  const typeCol = findCol(header, ["тип операции", "тип"]);
  const amountCol = findCol(header, ["сумма в валюте счёта", "сумма", "amount"]);
  const purposeCol = findCol(header, ["назначение платежа", "назначение", "описание операции"]);
  const payerCol = findCol(header, ["наименование плательщика", "плательщик"]);
  const recipientCol = findCol(header, ["наименование получателя", "получатель"]);
  const counterpartyCol = findCol(header, ["наименование контрагента", "контрагент"]);

  if (dateCol < 0 || amountCol < 0) return res.status(400).json({ error: "Не найдены колонки: дата, сумма" });

  const pool = getPool();
  const { rows: rules } = await pool.query(
    `SELECT counterparty, operation_type, department, logistics_stage, direction FROM pnl_classification_rules`
  );

  let created = 0;
  for (let i = hIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length < 6) continue;

    const typeStr = String(row[typeCol] ?? "").trim().toLowerCase();
    const isCredit = typeStr.includes("кредит") || typeStr === "приход";
    const isDebit = typeStr.includes("дебет") || typeStr === "расход";

    const amountAbs = parseAmount(row[amountCol]);
    if (amountAbs === 0) continue;
    const amount = isDebit ? -amountAbs : amountAbs;

    let date: Date | null = null;
    const dv = row[dateCol];
    if (dv instanceof Date) date = isNaN(dv.getTime()) ? null : dv;
    else if (typeof dv === "number") {
      const p = XLSX.SSF.parse_date_code(dv) as { y: number; m: number; d: number };
      date = new Date(p.y, p.m - 1, p.d);
    } else date = parseDateDDMMYYYY(String(dv ?? ""));
    if (!date || isNaN(date.getTime())) continue;

    const purpose = purposeCol >= 0 ? String(row[purposeCol] ?? "").trim() : "";
    let counterparty = "";
    if (isCredit && payerCol >= 0) counterparty = String(row[payerCol] ?? "").trim();
    else if (isDebit && recipientCol >= 0) counterparty = String(row[recipientCol] ?? "").trim();
    if (!counterparty && counterpartyCol >= 0) counterparty = String(row[counterpartyCol] ?? "").trim();
    if (!counterparty) counterparty = purpose.slice(0, 100) || "Не указан";

    const rule = rules.find(
      (r: any) =>
        counterparty.toLowerCase().includes(r.counterparty.toLowerCase()) ||
        r.counterparty.toLowerCase().includes(counterparty.toLowerCase())
    );

    await pool.query(
      `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, logistics_stage, direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [date, counterparty, purpose || counterparty, amount, rule?.operation_type ?? "OPEX", rule?.department ?? "GENERAL", rule?.logistics_stage ?? null, rule?.direction ?? null]
    );
    created++;
  }

  return res.json({ created });
}
