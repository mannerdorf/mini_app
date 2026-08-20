import type { Pool } from "pg";
import { loadPushLoginScopes, normalizeNotificationInn } from "./notificationInnScope.js";

export type AdminPushSubscriberCompany = {
  inn: string;
  name: string;
};

export type AdminPushSubscriber = {
  login: string;
  companyName: string;
  deviceCount: number;
  lastSeen: string | null;
  platforms: string[];
  serviceWide: boolean;
  boundFromProfile: boolean;
  /** Компании, по которым уходят автоматические пуши (счета / этапы / сводка). */
  pushCompanies: AdminPushSubscriberCompany[];
  /** Все привязки в account_companies + ИНН профиля. */
  accountCompanies: AdminPushSubscriberCompany[];
  /** Включённые типы автопуша по реестру push_activation (или пусто — legacy prefs). */
  enabledEvents: string[];
};

type TokenRow = {
  login: string;
  device_count: string | number;
  last_seen: Date | string | null;
  platforms: unknown;
};

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function companyLabel(inn: string, name: string): AdminPushSubscriberCompany {
  return { inn, name: name.trim() || inn };
}

export function mergeCompanyNames(
  inns: Iterable<string>,
  nameByInn: Map<string, string>,
): AdminPushSubscriberCompany[] {
  const out: AdminPushSubscriberCompany[] = [];
  const seen = new Set<string>();
  for (const raw of inns) {
    const inn = normalizeNotificationInn(raw);
    if (!inn || seen.has(inn)) continue;
    seen.add(inn);
    out.push(companyLabel(inn, nameByInn.get(inn) || ""));
  }
  return out.sort((a, b) => (a.name || a.inn).localeCompare(b.name || b.inn, "ru"));
}

export async function loadAdminPushSubscribers(pool: Pool): Promise<AdminPushSubscriber[]> {
  const tokenRows = await pool.query<TokenRow>(
    `SELECT lower(trim(login)) AS login,
            count(*)::int AS device_count,
            max(updated_at) AS last_seen,
            array_agg(DISTINCT platform) AS platforms
     FROM fcm_device_tokens
     WHERE coalesce(trim(login), '') <> ''
     GROUP BY 1
     ORDER BY max(updated_at) DESC NULLS LAST, login`,
  );

  const logins = tokenRows.rows.map((row) => String(row.login || "").trim().toLowerCase()).filter(Boolean);
  if (logins.length === 0) return [];

  const scopes = await loadPushLoginScopes(pool);
  const nameByInn = new Map<string, string>();
  const accountInnsByLogin = new Map<string, Set<string>>();
  const profileByLogin = new Map<string, { inn: string; companyName: string }>();

  try {
    const users = await pool.query<{ login: string; inn: string | null; company_name: string | null }>(
      `SELECT lower(trim(login)) AS login, inn, company_name
       FROM registered_users
       WHERE lower(trim(login)) = ANY($1::text[])`,
      [logins],
    );
    for (const row of users.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const inn = normalizeNotificationInn(row.inn);
      const companyName = String(row.company_name || "").trim();
      if (!login) continue;
      profileByLogin.set(login, { inn, companyName });
      if (inn && companyName && !nameByInn.has(inn)) nameByInn.set(inn, companyName);
    }
  } catch {
    // registered_users may be missing
  }

  try {
    const companies = await pool.query<{ login: string; inn: string; name: string | null }>(
      `SELECT lower(trim(login)) AS login, inn, name
       FROM account_companies
       WHERE lower(trim(login)) = ANY($1::text[])
         AND inn IS NOT NULL AND trim(inn) <> ''`,
      [logins],
    );
    for (const row of companies.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const inn = normalizeNotificationInn(row.inn);
      const name = String(row.name || "").trim();
      if (!login || !inn) continue;
      if (!accountInnsByLogin.has(login)) accountInnsByLogin.set(login, new Set());
      accountInnsByLogin.get(login)!.add(inn);
      if (name) nameByInn.set(inn, name);
    }
  } catch {
    // ignore
  }

  const missingNames = new Set<string>();
  for (const login of logins) {
    const scope = scopes.get(login);
    for (const inn of scope?.inns || []) {
      if (!nameByInn.has(inn)) missingNames.add(inn);
    }
    for (const inn of accountInnsByLogin.get(login) || []) {
      if (!nameByInn.has(inn)) missingNames.add(inn);
    }
    const profileInn = profileByLogin.get(login)?.inn;
    if (profileInn && !nameByInn.has(profileInn)) missingNames.add(profileInn);
  }

  if (missingNames.size > 0) {
    try {
      const { rows } = await pool.query<{ inn: string; customer_name: string | null }>(
        `SELECT inn, customer_name
         FROM cache_customers
         WHERE regexp_replace(coalesce(inn, ''), '\\D', '', 'g') = ANY($1::text[])`,
        [[...missingNames]],
      );
      for (const row of rows) {
        const inn = normalizeNotificationInn(row.inn);
        const name = String(row.customer_name || "").trim();
        if (inn && name && !nameByInn.has(inn)) nameByInn.set(inn, name);
      }
    } catch {
      // cache_customers optional
    }
  }

  const enabledEventsByLogin = new Map<string, Set<string>>();
  try {
    const act = await pool.query<{ login: string; event_id: string }>(
      `SELECT lower(trim(login)) AS login, event_id
       FROM push_activation
       WHERE lower(trim(login)) = ANY($1::text[])
         AND enabled = true`,
      [logins],
    );
    for (const row of act.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const eventId = String(row.event_id || "").trim();
      if (!login || !eventId) continue;
      if (!enabledEventsByLogin.has(login)) enabledEventsByLogin.set(login, new Set());
      enabledEventsByLogin.get(login)!.add(eventId);
    }
  } catch {
    // push_activation may be missing before migration 092
  }

  return tokenRows.rows.map((row) => {
    const login = String(row.login || "").trim().toLowerCase();
    const scope = scopes.get(login);
    const profile = profileByLogin.get(login);
    const accountInns = new Set<string>([...(accountInnsByLogin.get(login) || [])]);
    if (profile?.inn) accountInns.add(profile.inn);

    const platforms = Array.isArray(row.platforms)
      ? row.platforms.map((p) => String(p || "").trim()).filter(Boolean)
      : [];

    return {
      login,
      companyName: profile?.companyName || "",
      deviceCount: Number(row.device_count) || 0,
      lastSeen: asIso(row.last_seen),
      platforms,
      serviceWide: scope?.serviceWide === true,
      boundFromProfile: scope?.boundFromProfile === true,
      pushCompanies: mergeCompanyNames(scope?.inns || [], nameByInn),
      accountCompanies: mergeCompanyNames(accountInns, nameByInn),
      enabledEvents: [...(enabledEventsByLogin.get(login) || [])].sort(),
    };
  });
}
