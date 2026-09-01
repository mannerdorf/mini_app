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

/** Все ИНН, к которым логин может быть привязан (профиль + account_companies). */
export function collectAllowedPushInns(
  scope: PushLoginScope | undefined,
  companyInns: Iterable<string>,
): Set<string> {
  const allowed = new Set<string>();
  if (scope) {
    for (const inn of scope.inns) allowed.add(inn);
  }
  for (const raw of companyInns) {
    const inn = normalizeNotificationInn(raw);
    if (inn) allowed.add(inn);
  }
  return allowed;
}

/**
 * Эффективный скоуп автопуша:
 * — serviceWide без своего ИНН и без выбора → пусто;
 * — push_selected_inn из шапки (валидный среди профиля + account_companies) → только он;
 * — иначе базовый scope.inns (профиль / все компании).
 */
export function resolveEffectivePushInns(params: {
  scope: PushLoginScope;
  allowedCompanyInns: Iterable<string>;
  selectedInn?: string | null;
}): Set<string> {
  const { scope } = params;
  const allowed = collectAllowedPushInns(scope, params.allowedCompanyInns);
  const selected = normalizeNotificationInn(params.selectedInn);

  if (selected && allowed.has(selected)) {
    return new Set([selected]);
  }

  if (scope.serviceWide && scope.inns.size === 0) return new Set();

  return new Set(scope.inns);
}

type Queryable = {
  query: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

async function loadCompanyInnsByLogin(pool: Queryable): Promise<Map<string, string[]>> {
  const byLogin = new Map<string, string[]>();
  try {
    const companies = await pool.query<{ login: string; inn: string }>(
      `SELECT lower(trim(login)) AS login, inn
       FROM account_companies
       WHERE inn IS NOT NULL AND trim(inn) <> ''`,
    );
    for (const row of companies.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const inn = normalizeNotificationInn(row.inn);
      if (!login || !inn) continue;
      const list = byLogin.get(login) || [];
      list.push(inn);
      byLogin.set(login, list);
    }
  } catch {
    // account_companies may be missing
  }
  return byLogin;
}

async function loadPushSelectedInnByLogin(pool: Queryable): Promise<Map<string, string>> {
  const byLogin = new Map<string, string>();
  try {
    const { rows } = await pool.query<{ login: string; preferences: unknown }>(
      `SELECT lower(trim(login)) AS login, preferences
       FROM notification_preferences_state
       WHERE coalesce(trim(login), '') <> ''`,
    );
    for (const row of rows) {
      const login = String(row.login || "").trim().toLowerCase();
      if (!login) continue;
      const prefs = row.preferences && typeof row.preferences === "object" ? (row.preferences as Record<string, unknown>) : {};
      const inn = normalizeNotificationInn(prefs.push_selected_inn);
      if (inn) byLogin.set(login, inn);
    }
  } catch {
    // notification_preferences_state may be missing
  }
  return byLogin;
}

/** Скоуп автопуша с учётом push_selected_inn из notification_preferences_state. */
export async function loadEffectivePushLoginScopes(
  pool: Queryable,
): Promise<Map<string, PushLoginScope>> {
  const base = await loadPushLoginScopes(pool);
  const companyInnsByLogin = await loadCompanyInnsByLogin(pool);
  const selectedByLogin = await loadPushSelectedInnByLogin(pool);

  for (const [login, scope] of base.entries()) {
    const companyInns = companyInnsByLogin.get(login) || [];
    const effective = resolveEffectivePushInns({
      scope,
      allowedCompanyInns: companyInns,
      selectedInn: selectedByLogin.get(login),
    });
    base.set(login, { ...scope, inns: effective });
  }

  return base;
}
