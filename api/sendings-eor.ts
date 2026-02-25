import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

type EorStatus = "entry_allowed" | "full_inspection" | "turnaround";
const ALLOWED_STATUSES = new Set<EorStatus>(["entry_allowed", "full_inspection", "turnaround"]);

const normalizeLogin = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeDateOnly = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};

const parseStatuses = (input: unknown): EorStatus[] => {
  if (!Array.isArray(input)) return [];
  const list = input
    .map((x) => String(x || "").trim() as EorStatus)
    .filter((x): x is EorStatus => ALLOWED_STATUSES.has(x));
  return Array.from(new Set(list));
};

function pickCredentials(req: VercelRequest, body?: any) {
  const login =
    normalizeLogin(body?.login) ||
    normalizeLogin(req.headers["x-login"]) ||
    normalizeLogin(req.query.login);
  const password =
    normalizeText(body?.password) ||
    normalizeText(req.headers["x-password"]) ||
    normalizeText(req.query.password);
  return { login, password };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { login, password } = pickCredentials(req, body);
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный email или пароль" });
  }

  if (req.method === "GET") {
    try {
      const rows = await pool.query<{ row_key: string; sending_number: string | null; statuses: EorStatus[] }>(
        `select row_key, sending_number, statuses
           from sendings_eor
          where lower(trim(login)) = $1`,
        [login]
      );
      const map: Record<string, EorStatus[]> = {};
      for (const row of rows.rows) {
        if (!row.row_key) continue;
        const parsed = parseStatuses(row.statuses);
        map[row.row_key] = parsed;
        const sendingNumberKey = normalizeText(row.sending_number);
        if (sendingNumberKey && !map[sendingNumberKey]) {
          map[sendingNumberKey] = parsed;
        }
      }
      return res.status(200).json({ ok: true, map });
    } catch (e: any) {
      const message = String(e?.message || "");
      if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("sendings_eor")) {
        return res.status(500).json({ error: "Таблица sendings_eor не найдена. Примените миграцию 032_sendings_eor.sql" });
      }
      return res.status(500).json({ error: "Failed to load EOR map", details: message });
    }
  }

  const rowKey = normalizeText(body?.rowKey);
  const statuses = parseStatuses(body?.statuses);
  const inn = normalizeText(body?.inn) || null;
  const sendingNumber = normalizeText(body?.sendingNumber) || null;
  const sendingDate = normalizeDateOnly(body?.sendingDate);

  if (!rowKey) {
    return res.status(400).json({ error: "rowKey is required" });
  }

  try {
    if (statuses.length === 0) {
      await pool.query(
        `delete from sendings_eor
          where lower(trim(login)) = $1
            and row_key = $2`,
        [login, rowKey]
      );
      return res.status(200).json({ ok: true, rowKey, statuses: [] });
    }

    const updated = await pool.query(
      `update sendings_eor
          set inn = $3,
              sending_number = $4,
              sending_date = $5::date,
              statuses = $6::text[],
              updated_at = now()
        where lower(trim(login)) = $1
          and row_key = $2`,
      [login, rowKey, inn, sendingNumber, sendingDate, statuses]
    );

    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `insert into sendings_eor (login, inn, row_key, sending_number, sending_date, statuses)
         values ($1, $2, $3, $4, $5::date, $6::text[])`,
        [login, inn, rowKey, sendingNumber, sendingDate, statuses]
      );
    }

    return res.status(200).json({ ok: true, rowKey, statuses });
  } catch (e: any) {
    const message = String(e?.message || "");
    if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("sendings_eor")) {
      return res.status(500).json({ error: "Таблица sendings_eor не найдена. Примените миграцию 032_sendings_eor.sql" });
    }
    return res.status(500).json({ error: "Failed to save EOR status", details: message });
  }
}

