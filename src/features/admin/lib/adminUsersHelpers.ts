import type { CustomerItem } from "../../../components/modals/CustomerPickModal";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import { normalizeAnalyticsDashboardPermissions, PERMISSION_KEYS } from "./permissions";
import type { User } from "../types/adminUsers";

const MS30D = 30 * 24 * 3600 * 1000;

export function normalizeAdminUserPermissions(permissions: unknown): Record<string, boolean> {
  if (permissions && typeof permissions === "object" && !Array.isArray(permissions)) {
    return permissions as Record<string, boolean>;
  }
  if (typeof permissions === "string") {
    try {
      const parsed = JSON.parse(permissions) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, boolean>;
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return {};
}

export function normalizeAdminUserCompanies(companies: unknown): { inn: string; name: string }[] {
  if (!Array.isArray(companies)) return [];
  return companies
    .map((c) => ({
      inn: String((c as { inn?: unknown })?.inn ?? "").trim(),
      name: String((c as { name?: unknown })?.name ?? "").trim(),
    }))
    .filter((c) => c.inn);
}

export function normalizeAdminUserRow(user: User): User {
  return {
    ...user,
    permissions: normalizeAdminUserPermissions(user.permissions),
    companies: normalizeAdminUserCompanies(user.companies),
  };
}

export function buildEditorCustomersFromUser(user: User): CustomerItem[] {
  const companies = normalizeAdminUserCompanies(user.companies);
  if (companies.length > 0) {
    return companies.map((c) => ({ inn: c.inn, customer_name: c.name || "", email: "" }));
  }
  const inn = String(user.inn || "").trim();
  if (inn) {
    return [{ inn, customer_name: user.company_name || "", email: "" }];
  }
  return [];
}

export function buildEditorPermissionsFromUser(user: User): Record<string, boolean> {
  const permissions = normalizeAdminUserPermissions(user.permissions);
  return normalizeAnalyticsDashboardPermissions(
    PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, perm) => {
      acc[perm.key] = Boolean(permissions[perm.key]);
      return acc;
    }, {}),
  );
}

export function formatRelativeLoginTime(lastLoginAt: string | null | undefined, now = Date.now()): string {
  if (!lastLoginAt) return "никогда";
  const d = new Date(lastLoginAt);
  const dMs = now - d.getTime();
  const diffM = Math.floor(dMs / 60000);
  const diffH = Math.floor(dMs / 3600000);
  const diffD = Math.floor(dMs / 86400000);
  if (diffM < 1) return "только что";
  if (diffM < 60) return `${diffM} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD < 7) return `${diffD} дн назад`;
  return formatDisplayDateFromDate(d);
}

export function formatRelativeLoginTimeFromMs(lastLoginMs: number, now = Date.now()): string {
  if (!lastLoginMs) return "нет входов";
  const diffM = Math.floor((now - lastLoginMs) / 60000);
  const diffH = Math.floor((now - lastLoginMs) / 3600000);
  const diffD = Math.floor((now - lastLoginMs) / 86400000);
  if (diffM < 1) return "только что";
  if (diffM < 60) return `${diffM} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD < 7) return `${diffD} дн назад`;
  return formatDisplayDate(new Date(lastLoginMs).toISOString());
}

export function topActiveAccentOpacity(lastLoginAt: string | null | undefined, now = Date.now()): number {
  const lastMs = lastLoginAt ? new Date(lastLoginAt).getTime() : 0;
  const diffMs = lastMs ? now - lastMs : Infinity;
  const freshness = diffMs >= MS30D ? 0 : Math.max(0, 1 - diffMs / MS30D);
  return Math.min(0.5, 0.12 + freshness * 0.38);
}
