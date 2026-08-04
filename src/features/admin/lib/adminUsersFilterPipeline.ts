import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "./userSearch";
import { PERMISSION_KEYS, type PermissionPreset } from "./permissions";
import type { User } from "../types/adminUsers";

export const USERS_PAGE_SIZE = 50;

export const MS_7D = 7 * 24 * 60 * 60 * 1000;
export const MS_30D = 30 * 24 * 60 * 60 * 1000;

export function matchesAdminUserSearch(u: User, q: string): boolean {
  const raw = q.trim();
  if (!raw) return true;
  const ql = raw.toLowerCase();

  if (u.login && String(u.login).toLowerCase().includes(ql)) return true;

  const companies = u.companies ?? [];
  for (const c of companies) {
    if (innMatchesSearchQuery(c.inn, raw)) return true;
    if (legalEntityNameMatchesQuery(c.name || "", raw)) return true;
  }
  if (innMatchesSearchQuery(u.inn, raw)) return true;
  if (legalEntityNameMatchesQuery(u.company_name || "", raw)) return true;

  return false;
}

export function adminUserMatchesPreset(u: User, preset: PermissionPreset): boolean {
  const perms = u.permissions ?? {};
  for (const { key } of PERMISSION_KEYS) {
    if (key === "__financial__" || key === "service_mode") continue;
    if (!!perms[key] !== !!preset.permissions[key]) return false;
  }
  if (!!u.financial_access !== !!preset.financial) return false;
  const userServiceMode = !!(u.permissions?.service_mode || u.access_all_inns);
  if (userServiceMode !== !!preset.serviceMode) return false;
  return true;
}

export type UsersFilterBy =
  | "all"
  | "cms"
  | "no_cms"
  | "service_mode"
  | "supervisor"
  | "no_supervisor"
  | "analytics"
  | "no_analytics"
  | "home"
  | "no_home"
  | "dashboard"
  | "no_dashboard"
  | "sendings"
  | "no_sendings";

export type UsersFilterCounts = {
  all: number;
  cms: number;
  no_cms: number;
  service_mode: number;
  supervisor: number;
  no_supervisor: number;
  analytics: number;
  no_analytics: number;
  home: number;
  no_home: number;
  dashboard: number;
  no_dashboard: number;
  sendings: number;
  no_sendings: number;
  active: number;
  inactive: number;
  last_login_7d: number;
  last_login_30d: number;
  last_login_never: number;
  last_login_old: number;
  preset: (presetId: string) => number;
};

export function computeUsersFilterCounts(
  users: User[],
  searchQuery: string,
  permissionPresets: PermissionPreset[],
  now = Date.now(),
): UsersFilterCounts {
  const base = users.filter((u) => matchesAdminUserSearch(u, searchQuery));
  const withLastLogin = (pred: (u: User) => boolean) => base.filter(pred).length;
  return {
    all: base.length,
    cms: base.filter((u) => !!u.permissions?.cms_access).length,
    no_cms: base.filter((u) => !u.permissions?.cms_access).length,
    service_mode: base.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns).length,
    supervisor: base.filter((u) => !!u.permissions?.supervisor).length,
    no_supervisor: base.filter((u) => !u.permissions?.supervisor).length,
    analytics: base.filter((u) => !!u.permissions?.analytics).length,
    no_analytics: base.filter((u) => !u.permissions?.analytics).length,
    home: base.filter((u) => !!u.permissions?.home).length,
    no_home: base.filter((u) => !u.permissions?.home).length,
    dashboard: base.filter((u) => !!u.permissions?.dashboard).length,
    no_dashboard: base.filter((u) => !u.permissions?.dashboard).length,
    sendings: base.filter((u) => !!u.permissions?.doc_sendings).length,
    no_sendings: base.filter((u) => !u.permissions?.doc_sendings).length,
    active: base.filter((u) => !!u.active).length,
    inactive: base.filter((u) => !u.active).length,
    last_login_7d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= MS_7D),
    last_login_30d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= MS_30D),
    last_login_never: withLastLogin((u) => u.last_login_at == null),
    last_login_old: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > MS_30D),
    preset: (presetId: string) => {
      const preset = permissionPresets.find((p) => p.id === presetId);
      if (!preset) return 0;
      return base.filter((u) => adminUserMatchesPreset(u, preset)).length;
    },
  };
}

export type TopActiveUser = {
  id: number;
  login: string;
  company_name: string;
  last_login_at: string | null;
};

export type TopActiveCustomer = {
  customer: string;
  last_login_at: string | null;
  users_count: number;
};

export function computeTopActiveUsers(users: User[]): TopActiveUser[] {
  return [...users]
    .filter((u) => u.active)
    .sort((a, b) => {
      const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
      const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 15)
    .map((u) => ({
      id: u.id,
      login: u.login,
      company_name: u.company_name ?? "",
      last_login_at: u.last_login_at ?? null,
    }));
}

export function computeTopActiveCustomers(users: User[]): TopActiveCustomer[] {
  const map = new Map<string, TopActiveCustomer>();

  users
    .filter((u) => u.active)
    .forEach((u) => {
      const names = new Set<string>();
      const companyName = (u.company_name ?? "").trim();
      if (companyName) names.add(companyName);
      if (Array.isArray(u.companies)) {
        u.companies.forEach((c) => {
          const n = (c?.name ?? "").trim();
          if (n) names.add(n);
        });
      }
      if (names.size === 0) names.add("Без заказчика");

      names.forEach((name) => {
        const existing = map.get(name);
        if (!existing) {
          map.set(name, {
            customer: name,
            last_login_at: u.last_login_at ?? null,
            users_count: 1,
          });
          return;
        }
        const prevMs = existing.last_login_at ? new Date(existing.last_login_at).getTime() : 0;
        const curMs = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
        existing.users_count += 1;
        if (curMs > prevMs) existing.last_login_at = u.last_login_at ?? null;
      });
    });

  return Array.from(map.values())
    .sort((a, b) => {
      const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
      const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
      if (bt !== at) return bt - at;
      return a.customer.localeCompare(b.customer, "ru");
    })
    .slice(0, 15);
}
