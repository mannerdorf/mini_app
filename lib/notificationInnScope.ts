/** Скоуп пушей: только ИНН, привязанный к логину, не весь справочник. */

export function normalizeNotificationInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

export type PushLoginScope = {
  login: string;
  inns: Set<string>;
  /** Служебный / access_all_inns — массовые пуши по всем компаниям запрещены. */
  serviceWide: boolean;
  /** ИНН взят из профиля registered_users — не расширяем справочником. */
  boundFromProfile: boolean;
};

function isServiceWideUser(row: {
  access_all_inns?: boolean | null;
  permissions?: unknown;
}): boolean {
  if (row.access_all_inns === true) return true;
  const perms = row.permissions && typeof row.permissions === "object" ? (row.permissions as Record<string, unknown>) : {};
  return perms.service_mode === true;
}

/**
 * ИНН для автоматических пушей (грузы / счета / сводка):
 * — если у пользователя есть inn в registered_users — только он;
 * — иначе компании из account_companies;
 * — service_mode / access_all_inns без своего inn — пустой набор (не спамим всеми контрагентами).
 */
export function resolvePushInnsForLogin(params: {
  registeredInn?: string | null;
  companyInns: Iterable<string>;
  accessAllInns?: boolean | null;
  permissions?: unknown;
}): { inns: Set<string>; serviceWide: boolean; boundFromProfile: boolean } {
  const serviceWide = isServiceWideUser({
    access_all_inns: params.accessAllInns,
    permissions: params.permissions,
  });
  const bound = normalizeNotificationInn(params.registeredInn);
  if (bound) return { inns: new Set([bound]), serviceWide, boundFromProfile: true };
  if (serviceWide) return { inns: new Set(), serviceWide, boundFromProfile: false };
  const inns = new Set<string>();
  for (const raw of params.companyInns) {
    const inn = normalizeNotificationInn(raw);
    if (inn) inns.add(inn);
  }
  return { inns, serviceWide, boundFromProfile: false };
}

export function applyCompanyInnsToScope(scope: PushLoginScope, companyInns: Iterable<string>): void {
  if (scope.boundFromProfile || scope.serviceWide) return;
  for (const raw of companyInns) {
    const inn = normalizeNotificationInn(raw);
    if (inn) scope.inns.add(inn);
  }
}

export function loginAllowsPushInn(scope: PushLoginScope | undefined, inn: unknown): boolean {
  if (!scope) return false;
  const normalized = normalizeNotificationInn(inn);
  return Boolean(normalized && scope.inns.has(normalized));
}

export async function loadPushLoginScopes(
  pool: {
    query: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  },
): Promise<Map<string, PushLoginScope>> {
  const byLogin = new Map<string, PushLoginScope>();

  try {
    const users = await pool.query<{
      login: string;
      inn: string | null;
      access_all_inns: boolean | null;
      permissions: unknown;
    }>(
      `SELECT lower(trim(login)) AS login, inn, access_all_inns, permissions
       FROM registered_users
       WHERE coalesce(active, true) = true AND coalesce(trim(login), '') <> ''`,
    );
    for (const row of users.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      if (!login) continue;
      const resolved = resolvePushInnsForLogin({
        registeredInn: row.inn,
        companyInns: [],
        accessAllInns: row.access_all_inns,
        permissions: row.permissions,
      });
      byLogin.set(login, {
        login,
        inns: resolved.inns,
        serviceWide: resolved.serviceWide,
        boundFromProfile: resolved.boundFromProfile,
      });
    }
  } catch {
    // таблица может отсутствовать
  }

  const companies = await pool.query<{ login: string; inn: string }>(
    `SELECT lower(trim(login)) AS login, inn
     FROM account_companies
     WHERE inn IS NOT NULL AND trim(inn) <> ''`,
  );
  const innsByLogin = new Map<string, string[]>();
  for (const row of companies.rows) {
    const login = String(row.login || "").trim().toLowerCase();
    const inn = normalizeNotificationInn(row.inn);
    if (!login || !inn) continue;
    const list = innsByLogin.get(login) || [];
    list.push(inn);
    innsByLogin.set(login, list);
  }
  for (const [login, companyInns] of innsByLogin.entries()) {
    const existing = byLogin.get(login);
    if (!existing) {
      byLogin.set(login, { login, inns: new Set(companyInns), serviceWide: false, boundFromProfile: false });
      continue;
    }
    applyCompanyInnsToScope(existing, companyInns);
  }

  return byLogin;
}

export function invertScopesByInn(scopes: Map<string, PushLoginScope>): Map<string, string[]> {
  const byInn = new Map<string, string[]>();
  for (const scope of scopes.values()) {
    for (const inn of scope.inns) {
      const list = byInn.get(inn) || [];
      list.push(scope.login);
      byInn.set(inn, list);
    }
  }
  return byInn;
}
