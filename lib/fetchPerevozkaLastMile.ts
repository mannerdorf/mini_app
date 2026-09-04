import { extractCargoLastMileMeta } from "./cargoLastMileMeta.js";

const GETAPI_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const GET_PEREVOZKA_METHODS = ["Getperevozka", "GetPerevozka"] as const;
const UPSTREAM_TIMEOUT_MS = 20_000;

function normalizePerevozkaNumberForLookup(num: string): string {
  const trimmed = String(num).trim();
  const digits = trimmed.replace(/^0000-/, "").replace(/\D/g, "");
  if (!digits) return trimmed;
  const core = digits.replace(/^0+/, "") || digits;
  if (/^\d{1,9}$/.test(core)) return core.padStart(9, "0");
  return trimmed;
}

function looksLikeTimelineRow(row: Record<string, unknown>): boolean {
  const stage = String(row.Stage ?? row.stage ?? row.Status ?? row.status ?? "").trim();
  const date = String(row.Date ?? row.date ?? "").trim();
  if (!stage || !date) return false;
  const meta = extractCargoLastMileMeta(row);
  return !meta.autoReg && !meta.driver;
}

function collectPerevozkaRecords(json: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 5 || json == null) return;
  if (Array.isArray(json)) {
    for (const row of json) collectPerevozkaRecords(row, out, depth + 1);
    return;
  }
  if (typeof json !== "object") return;
  const rec = json as Record<string, unknown>;
  if (!looksLikeTimelineRow(rec)) out.push(rec);
  for (const key of [
    "Response",
    "Data",
    "Result",
    "result",
    "data",
    "items",
    "Items",
    "LastMile",
    "lastMile",
    "LM",
    "Expedition",
  ]) {
    if (rec[key] != null) collectPerevozkaRecords(rec[key], out, depth + 1);
  }
}

/** Достаёт карточку с полями последней мили из ответа GetPerevozka (не таймлайн статусов). */
export function flattenPerevozkaPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const records: Record<string, unknown>[] = [];
  collectPerevozkaRecords(json, records);
  for (const rec of records) {
    const meta = extractCargoLastMileMeta(rec);
    if (meta.autoReg || meta.driver || meta.driverTel || meta.autoType) return rec;
  }
  return null;
}

async function fetchUpstream(url: string, haulzAuth: string): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Auth: haulzAuth,
        Authorization: SERVICE_AUTH,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 504, text: msg.includes("abort") ? "Upstream timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Деталь GetPerevozka из 1С — для полей последней мили в push-шаблонах. */
export async function fetchPerevozkaRecordForPush(params: {
  cargoNumber: string;
  customerInn?: string;
  serviceLogin: string;
  servicePassword: string;
}): Promise<Record<string, unknown> | null> {
  const number = normalizePerevozkaNumberForLookup(params.cargoNumber);
  if (!number) return null;
  const haulzAuth =
    process.env.POSTB_HAULZ_AUTH?.trim() || `Basic ${params.serviceLogin}:${params.servicePassword}`;
  const inn = String(params.customerInn || "").trim();

  for (const methodName of GET_PEREVOZKA_METHODS) {
    const innVariants = inn ? [inn, ""] : [""];
    for (const innValue of innVariants) {
      const url = new URL(GETAPI_BASE);
      url.searchParams.set("metod", methodName);
      url.searchParams.set("Number", number);
      if (innValue) url.searchParams.set("INN", innValue);

      const upstream = await fetchUpstream(url.toString(), haulzAuth);
      if (!upstream.ok) continue;
      try {
        const json = JSON.parse(upstream.text);
        const flat = flattenPerevozkaPayload(json);
        if (flat) return flat;
      } catch {
        continue;
      }
    }
  }
  return null;
}
