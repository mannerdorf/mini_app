import type { VercelRequest, VercelResponse } from "@vercel/node";
const BASE_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

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

function buildCargoCandidates(rawCargoNumber: string): string[] {
  const value = normalizeText(rawCargoNumber);
  if (!value) return [];
  const out = new Set<string>();
  out.add(value);

  // В 1С номер перевозки часто ожидается с ведущими нулями (например 000136334).
  const digits = value.replace(/\D/g, "");
  if (digits) {
    out.add(digits);
    if (digits.length < 9) out.add(digits.padStart(9, "0"));
  }
  return Array.from(out);
}

async function callSetPlanDate(
  serviceLogin: string,
  servicePassword: string,
  cargoNumber: string,
  date: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = new URL(BASE_URL);
  url.searchParams.set("metod", "SetPlanDataDostavki");
  url.searchParams.set("Perevozka", cargoNumber);
  url.searchParams.set("Date", date);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Auth: `Basic ${serviceLogin}:${servicePassword}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const message = json?.Error ?? json?.error ?? json?.message;
        return { ok: false, error: String(message || text || upstream.statusText || `HTTP ${upstream.status}`) };
      } catch {
        return { ok: false, error: text || upstream.statusText || `HTTP ${upstream.status}` };
      }
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

  const date = normalizeDateOnly(body?.date);
  if (!date) {
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  }

  const cargoNumbers = parseCargoNumbers(body?.cargoNumbers);
  if (cargoNumbers.length === 0) {
    return res.status(400).json({ error: "cargoNumbers is required" });
  }

  const serviceLogin = String(
    process.env.PLAN_DATE_SERVICE_LOGIN ||
    process.env.HAULZ_1C_SERVICE_LOGIN ||
    process.env.PEREVOZKI_SERVICE_LOGIN ||
    ""
  ).trim();
  const servicePassword = String(
    process.env.PLAN_DATE_SERVICE_PASSWORD ||
    process.env.HAULZ_1C_SERVICE_PASSWORD ||
    process.env.PEREVOZKI_SERVICE_PASSWORD ||
    ""
  ).trim();
  if (!serviceLogin || !servicePassword) {
    return res.status(503).json({
      error:
        "Set PLAN_DATE_SERVICE_LOGIN/PASSWORD or HAULZ_1C_SERVICE_LOGIN/PASSWORD or PEREVOZKI_SERVICE_LOGIN/PASSWORD in Vercel.",
    });
  }

  const results = await Promise.all(
    cargoNumbers.map(async (cargoNumber) => {
      const candidates = buildCargoCandidates(cargoNumber);
      let lastError = "Ошибка записи даты в 1С";
      let appliedCargoNumber = cargoNumber;
      let ok = false;

      for (const candidate of candidates) {
        const result = await callSetPlanDate(serviceLogin, servicePassword, candidate, date);
        if (result.ok) {
          ok = true;
          appliedCargoNumber = candidate;
          break;
        }
        lastError = result.error;
      }

      return {
        cargoNumber: appliedCargoNumber,
        ok,
        error: ok ? null : lastError,
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
