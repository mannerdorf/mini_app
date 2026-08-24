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

function flattenPerevozkaPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  if (Array.isArray(json)) {
    const first = json[0];
    return first && typeof first === "object" && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;
  }
  const record = json as Record<string, unknown>;
  for (const key of ["Response", "Data", "Result", "result", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return { ...record, ...(nested as Record<string, unknown>) };
    }
  }
  return record;
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

  for (const methodName of GET_PEREVOZKA_METHODS) {
    const url = new URL(GETAPI_BASE);
    url.searchParams.set("metod", methodName);
    url.searchParams.set("Number", number);
    const inn = String(params.customerInn || "").trim();
    if (inn) url.searchParams.set("INN", inn);

    const upstream = await fetchUpstream(url.toString(), haulzAuth);
    if (!upstream.ok) continue;
    try {
      const json = JSON.parse(upstream.text);
      return flattenPerevozkaPayload(json);
    } catch {
      continue;
    }
  }
  return null;
}
