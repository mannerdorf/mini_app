import type { Pool } from "pg";
import { getCargoStatusKey, type LegacyCargoStatusKey } from "../../lib/notificationPoll.js";

export type PushAudience =
  | { type: "all_with_token" }
  | { type: "logins"; logins: string[] }
  | { type: "inns"; inns: string[] }
  | { type: "cargo_in_transit" }
  | { type: "cargo_accepted" }
  | { type: "cargo_delivered" };

const CARGO_AUDIENCE_STATUS: Record<
  "cargo_in_transit" | "cargo_accepted" | "cargo_delivered",
  LegacyCargoStatusKey
> = {
  cargo_in_transit: "in_transit",
  cargo_accepted: "accepted",
  cargo_delivered: "delivered",
};

function normalizeLogin(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function normalizeInn(raw: string): string {
  return String(raw || "").replace(/\D/g, "").trim();
}

function parseStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\n,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export function parsePushAudience(body: unknown): PushAudience | { error: string } {
  const audience =
    body && typeof body === "object" && "audience" in body ? (body as { audience?: unknown }).audience : body;
  if (!audience || typeof audience !== "object") {
    return { error: "Укажите audience" };
  }
  const type = String((audience as { type?: unknown }).type || "").trim();
  if (type === "all_with_token") return { type: "all_with_token" };
  if (type === "logins") {
    const logins = parseStringList((audience as { logins?: unknown }).logins).map(normalizeLogin).filter(Boolean);
    if (logins.length === 0) return { error: "Укажите хотя бы один login" };
    return { type: "logins", logins: [...new Set(logins)] };
  }
  if (type === "inns") {
    const inns = parseStringList((audience as { inns?: unknown }).inns).map(normalizeInn).filter(Boolean);
    if (inns.length === 0) return { error: "Укажите хотя бы один ИНН" };
    return { type: "inns", inns: [...new Set(inns)] };
  }
  if (type === "cargo_in_transit" || type === "cargo_accepted" || type === "cargo_delivered") {
    return { type };
  }
  return { error: "Неизвестный тип audience" };
}

export async function resolvePushRecipientLogins(pool: Pool, audience: PushAudience): Promise<string[]> {
  const set = new Set<string>();

  if (audience.type === "all_with_token") {
    const { rows } = await pool.query<{ login: string }>(
      `SELECT DISTINCT lower(trim(login)) AS login
       FROM fcm_device_tokens
       WHERE coalesce(trim(login), '') <> ''`,
    );
    for (const row of rows) {
      const login = normalizeLogin(row.login);
      if (login) set.add(login);
    }
    return [...set];
  }

  if (audience.type === "logins") {
    for (const loginRaw of audience.logins) {
      const login = normalizeLogin(loginRaw);
      if (login) set.add(login);
    }
    return [...set];
  }

  if (audience.type === "inns") {
    const { rows } = await pool.query<{ login: string }>(
      `SELECT DISTINCT lower(trim(login)) AS login
       FROM account_companies
       WHERE inn = ANY($1::text[]) AND coalesce(trim(login), '') <> ''`,
      [audience.inns],
    );
    for (const row of rows) {
      const login = normalizeLogin(row.login);
      if (login) set.add(login);
    }
    return [...set];
  }

  const statusKey = CARGO_AUDIENCE_STATUS[audience.type];
  const { rows } = await pool.query<{ login: string; state: string }>(
    `SELECT DISTINCT lower(trim(ac.login)) AS login, cls.state
     FROM account_companies ac
     INNER JOIN cargo_last_state cls ON cls.inn = ac.inn
     WHERE coalesce(trim(ac.login), '') <> ''`,
  );
  for (const row of rows) {
    if (getCargoStatusKey(row.state) !== statusKey) continue;
    const login = normalizeLogin(row.login);
    if (login) set.add(login);
  }
  return [...set];
}

export async function splitLoginsByFcmToken(
  pool: Pool,
  logins: string[],
): Promise<{ withToken: string[]; withoutToken: string[] }> {
  if (logins.length === 0) return { withToken: [], withoutToken: [] };
  const { rows } = await pool.query<{ login: string }>(
    `SELECT DISTINCT lower(trim(login)) AS login
     FROM fcm_device_tokens
     WHERE lower(trim(login)) = ANY($1::text[])`,
    [logins],
  );
  const tokenSet = new Set(rows.map((row) => normalizeLogin(row.login)).filter(Boolean));
  const withToken: string[] = [];
  const withoutToken: string[] = [];
  for (const login of logins) {
    if (tokenSet.has(login)) withToken.push(login);
    else withoutToken.push(login);
  }
  return { withToken, withoutToken };
}
