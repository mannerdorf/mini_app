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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { fields, files } = await parseMultipart(req);
  const file = files.find((f) => f.fieldName === "file");
  const month = Number(fields.month);
  const year = Number(fields.year);
  if (!file) return res.status(400).json({ error: "Нужен файл" });
  if (!month || !year) return res.status(400).json({ error: "Нужен период" });

  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
  if (!data.length) return res.status(400).json({ error: "Файл пустой" });

  const hIdx = findHeaderRow(data);
  const header = data[hIdx] as unknown[];
  const typeCol = findCol(header, ["тип операции", "тип"]);
  const amountCol = findCol(header, ["сумма в валюте счёта", "сумма", "amount"]);
  const purposeCol = findCol(header, ["назначение платежа", "назначение", "описание операции"]);
  const recipientCol = findCol(header, ["наименование получателя", "получатель"]);
  const counterpartyNameCol = findCol(header, ["наименование контрагента"]);

  if (amountCol < 0) return res.status(400).json({ error: "Не найдена колонка суммы" });

  const byCounterparty = new Map<string, { totalAmount: number; count: number }>();

  for (let i = hIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length < 2) continue;
    const typeStr = String(row[typeCol ?? 0] ?? "").trim().toLowerCase();
    const isDebit = typeStr.includes("дебет") || typeStr === "расход";
    if (!isDebit) continue;

    const amountAbs = parseAmount(row[amountCol]);
    if (amountAbs === 0) continue;

    const purpose = purposeCol >= 0 ? String(row[purposeCol] ?? "").trim() : "";
    let counterparty = "";
    if (recipientCol >= 0) counterparty = String(row[recipientCol] ?? "").trim();
    if (!counterparty && counterpartyNameCol >= 0) counterparty = String(row[counterpartyNameCol] ?? "").trim();
    if (!counterparty) counterparty = purpose.slice(0, 100) || "Не указан";

    const key = counterparty.trim() || "Без контрагента";
    const cur = byCounterparty.get(key) ?? { totalAmount: 0, count: 0 };
    byCounterparty.set(key, { totalAmount: cur.totalAmount + amountAbs, count: cur.count + 1 });
  }

  const period = `${year}-${String(month).padStart(2, "0")}-01`;
  const pool = getPool();

  await pool.query("DELETE FROM pnl_statement_expenses WHERE period = $1", [period]);

  for (const [counterparty, v] of byCounterparty.entries()) {
    await pool.query(
      `INSERT INTO pnl_statement_expenses (period, counterparty, total_amount, operations_count, accounted)
       VALUES ($1, $2, $3, $4, false)`,
      [period, counterparty, v.totalAmount, v.count]
    );
  }

  const { rows: saved } = await pool.query(
    `SELECT counterparty, total_amount AS "totalAmount", operations_count AS count, accounted
     FROM pnl_statement_expenses WHERE period = $1 ORDER BY total_amount DESC`,
    [period]
  );

  return res.json({ byCounterparty: saved });
}
