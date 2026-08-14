import type { VercelRequest } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { pickHaulzCredentials } from "./_haulzReturns.js";
import { lookupCustomerInnByName } from "../lib/resolveCustomerInn.js";
import type {
  AddressSelection,
  DeliveryParty,
  MainlineMode,
  ParcelPlace,
  QuoteRequest,
} from "../lib/haulzCalculator/types.js";

export const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const normalizeInn = (v: unknown) => String(v ?? "").replace(/\D/g, "").trim();

export type DocumentsOrderAccess = {
  login: string;
  loginKey: string;
  customerInn: string;
  customerName?: string;
};

export function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export function parseAddress(raw: unknown): AddressSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const point = o.point as { lat?: unknown; lon?: unknown } | undefined;
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label = String(o.label ?? "").trim();
  const fullAddress = String(o.fullAddress ?? o.full_address ?? label).trim();
  if (!fullAddress) return null;
  const city = o.city === "moscow" || o.city === "kaliningrad" ? o.city : undefined;
  return {
    label: label || fullAddress,
    fullAddress,
    point: { lat, lon },
    city,
    sourceId: typeof o.sourceId === "string" ? o.sourceId : undefined,
  };
}

export function parsePlaces(raw: unknown): ParcelPlace[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ weightKg: 1, volumeM3: 0.01 }];
  }
  return raw.map((p) => {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    return {
      weightKg: Math.max(0, Number(o.weightKg ?? o.weight_kg) || 0),
      volumeM3: Math.max(0, Number(o.volumeM3 ?? o.volume_m3) || 0),
    };
  });
}

export function parseParty(raw: unknown): DeliveryParty | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "point" ? "point" : o.mode === "courier" ? "courier" : undefined;
  if (!mode) return undefined;
  const innRaw = typeof o.inn === "string" ? o.inn.replace(/\D/g, "").trim() : "";
  return {
    mode,
    inn: innRaw || undefined,
    phone: typeof o.phone === "string" ? o.phone.trim() : undefined,
    fullName: typeof o.fullName === "string" ? o.fullName.trim() : undefined,
    companyName:
      typeof o.companyName === "string"
        ? o.companyName.trim()
        : typeof o.company_name === "string"
          ? o.company_name.trim()
          : undefined,
  };
}

export function parseCustomerParty(body: Record<string, unknown>, customerInn: string): DeliveryParty {
  const fromBody = parseParty(body.customerParty ?? body.customer_party);
  const name =
    String(body.customerName ?? body.customer_name ?? fromBody?.companyName ?? "").trim() || undefined;
  return {
    mode: "point",
    inn: customerInn,
    companyName: name,
  };
}

export function defaultPickupDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildQuoteRequestFromBody(
  body: Record<string, unknown>,
  customerInn: string,
): { quoteReq: QuoteRequest; from: AddressSelection; to: AddressSelection } | { error: string } {
  const from = parseAddress(body.from);
  const to = parseAddress(body.to);
  if (!from || !to) {
    return { error: "from и to с координатами обязательны" };
  }

  const modeRaw = String(body.mainlineMode ?? body.mainline_mode ?? "ferry").toLowerCase();
  const mainlineMode: MainlineMode = modeRaw === "auto" ? "auto" : "ferry";

  const quoteReq: QuoteRequest = {
    from,
    to,
    places: parsePlaces(body.places),
    mainlineMode,
    direction:
      body.direction === "mow_kgd" || body.direction === "kgd_mow" ? body.direction : undefined,
    declaredValueRub: Number(body.declaredValueRub ?? body.declared_value_rub) || 0,
    extraCodes: Array.isArray(body.extraCodes)
      ? body.extraCodes.map(String)
      : Array.isArray(body.extra_codes)
        ? body.extra_codes.map(String)
        : [],
    kmOverride:
      body.kmOverride && typeof body.kmOverride === "object"
        ? {
            moscow: Number((body.kmOverride as Record<string, unknown>).moscow),
            kaliningrad: Number((body.kmOverride as Record<string, unknown>).kaliningrad),
          }
        : undefined,
    fromParty: parseParty(body.fromParty ?? body.from_party),
    toParty: parseParty(body.toParty ?? body.to_party),
    customerParty: parseCustomerParty(body, customerInn),
    routeKmMode: "osrm",
  };

  return { quoteReq, from, to };
}

/** Доступ к форме заявки: зарегистрированный пользователь + permissions.doc_orders. */
export async function resolveDocumentsOrderAccess(
  req: VercelRequest,
  body?: unknown,
): Promise<DocumentsOrderAccess | null> {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const { login, password } = pickHaulzCredentials(req, body);
  if (!login || !password) return null;

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) return null;

  const loginKey = login.trim().toLowerCase();
  const { rows } = await pool.query<{ permissions: Record<string, boolean> | null }>(
    `select permissions from registered_users where lower(trim(login)) = $1 and active = true`,
    [loginKey],
  );
  const perms = rows[0]?.permissions;
  if (perms?.doc_orders !== true) return null;

  const customerName = String(b.customerName ?? b.customer_name ?? "").trim() || undefined;
  let customerInn = normalizeInn(b.inn ?? b.customerInn ?? b.customer_inn);
  if (!customerInn && customerName) {
    const resolved = await lookupCustomerInnByName(pool, loginKey, customerName);
    if (resolved?.inn) customerInn = normalizeInn(resolved.inn);
  }
  if (!customerInn) return null;

  return { login, loginKey, customerInn, customerName };
}
