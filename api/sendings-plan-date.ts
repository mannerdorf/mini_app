import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

const BASE_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

const normalizeLogin = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeText = (value: unknown) => String(value ?? "").trim();

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function parseCargoNumbers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    const number = normalizeText(value);
    if (number) unique.add(number);
  }
  return Array.from(unique);
}

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

async function callSetPlanDate(login: string, password: string, cargoNumber: string, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = new URL(BASE_URL);
  url.searchParams.set("metod", "SetPlanDataDostavki");
  url.searchParams.set("Perevozka", cargoNumber);
  url.searchParams.set("Date", date);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Auth: `Basic ${login}:${password}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return { ok: false, error: text || upstream.statusText || `HTTP ${upstream.status}` };
    }
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (json && typeof json === "object" && json.Success === false) {
        const message = json.Error ?? json.error ?? json.message;
        return { ok: false, error: String(message || "Ошибка записи даты в 1С") };
      }
    } catch {
      // Non-JSON ответ считаем успешным, если HTTP 2xx
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || "Network error") };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

  const date = normalizeDateOnly(body?.date);
  if (!date) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  const cargoNumbers = parseCargoNumbers(body?.cargoNumbers);
  if (cargoNumbers.length === 0) {
    return res.status(400).json({ error: "cargoNumbers is required" });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный email или пароль" });
  }

  const results = await Promise.all(
    cargoNumbers.map(async (cargoNumber) => {
      const result = await callSetPlanDate(login, password, cargoNumber, date);
      return {
        cargoNumber,
        ok: result.ok,
        error: result.ok ? null : result.error,
      };
    })
  );

  const okCount = results.filter((r) => r.ok).length;
  const errorItems = results.filter((r) => !r.ok);
  return res.status(200).json({
    ok: errorItems.length === 0,
    date,
    requested: cargoNumbers.length,
    updated: okCount,
    failed: errorItems.length,
    errors: errorItems,
  });
}
