import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { fetchAdminUsers } from "../../../api/client/admin/users";
import {
  PERMISSION_KEYS,
  createDefaultPermissions,
  type PermissionPreset,
} from "../lib/permissions";
import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "../lib/userSearch";
import type { User } from "../types/adminUsers";

const USERS_PAGE_SIZE = 50;

type UseAdminUsersOptions = {
  onLogout?: (reason?: "expired") => void;
  onError?: (msg: string | null) => void;
  enabled?: boolean;
};

export function useAdminUsers(
  adminToken: string,
  permissionPresets: PermissionPreset[],
  options: UseAdminUsersOptions = {}
) {
  const { onLogout, onError, enabled = true } = options;

  const [users, setUsers] = useState<User[]>([]);
  const [lastLoginAvailable, setLastLoginAvailable] = useState(true);
  const [topActiveExpanded, setTopActiveExpanded] = useState(false);
  const [topActiveMode, setTopActiveMode] = useState<"users" | "customers">("users");
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [usersViewMode, setUsersViewMode] = useState<"login" | "customer">("login");
  const [expandedCustomerLabels, setExpandedCustomerLabels] = useState<Set<string>>(new Set());
  const [usersSortBy, setUsersSortBy] = useState<"email" | "date" | "active">("email");
  const [usersSortOrder, setUsersSortOrder] = useState<"asc" | "desc">("asc");
  const [usersFilterBy, setUsersFilterBy] = useState<
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
    | "no_sendings"
  >("all");
  const [usersFilterLastLogin, setUsersFilterLastLogin] = useState<"all" | "7d" | "30d" | "never" | "old">("all");
  const [usersFilterActive, setUsersFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [usersFilterPresetId, setUsersFilterPresetId] = useState<string>("");
  const [usersVisibleCount, setUsersVisibleCount] = useState(USERS_PAGE_SIZE);
  const [deactivateConfirmUserId, setDeactivateConfirmUserId] = useState<number | null>(null);
  const [bulkDeactivateConfirmOpen, setBulkDeactivateConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [bulkPermissions, setBulkPermissions] = useState<Record<string, boolean>>(() => createDefaultPermissions());
  const [bulkFinancial, setBulkFinancial] = useState(false);
  const [bulkAccessAllInns, setBulkAccessAllInns] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSelectedPresetId, setBulkSelectedPresetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [customerDirectoryMap, setCustomerDirectoryMap] = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const data = await fetchAdminUsers(adminToken);
      setUsers(data.users);
      setLastLoginAvailable(data.last_login_available);
    } catch (e: unknown) {
      if ((e as Error & { status?: number })?.status === 401) {
        onLogout?.("expired");
        return;
      }
      onError?.((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onLogout, onError]);

  const fetchUsersRef = useRef(fetchUsers);
  const fetchingTabRef = useRef(false);
  fetchUsersRef.current = fetchUsers;

  useEffect(() => {
    if (!enabled) return;
    if (fetchingTabRef.current) return;
    fetchingTabRef.current = true;
    fetchUsersRef.current()?.finally(() => {
      fetchingTabRef.current = false;
    });
  }, [enabled, adminToken]);

  useEffect(() => {
    if (!enabled) return;
    searchAdminCustomers(adminToken, { limit: 2000 })
      .then((customers) => {
        const map: Record<string, string> = {};
        for (const c of customers) {
          if (c.inn && c.customer_name) map[c.inn] = c.customer_name;
        }
        setCustomerDirectoryMap(map);
      })
      .catch(() => {});
  }, [enabled, adminToken]);

  const matchesUserSearch = useCallback((u: User, q: string) => {
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
  }, []);

  const userMatchesPreset = useCallback((u: User, preset: PermissionPreset) => {
    const perms = u.permissions ?? {};
    for (const { key } of PERMISSION_KEYS) {
      if (key === "__financial__" || key === "service_mode") continue;
      if (!!perms[key] !== !!preset.permissions[key]) return false;
    }
    if (!!u.financial_access !== !!preset.financial) return false;
    const userServiceMode = !!(u.permissions?.service_mode || u.access_all_inns);
    if (userServiceMode !== !!preset.serviceMode) return false;
    return true;
  }, []);

  const now = Date.now();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  const usersFilterCounts = useMemo(() => {
    const q = usersSearchQuery.trim();
    const base = users.filter((u) => matchesUserSearch(u, q));
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
      last_login_7d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms7d),
      last_login_30d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms30d),
      last_login_never: withLastLogin((u) => u.last_login_at == null),
      last_login_old: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > ms30d),
      preset: (presetId: string) => {
        const preset = permissionPresets.find((p) => p.id === presetId);
        if (!preset) return 0;
        return base.filter((u) => userMatchesPreset(u, preset)).length;
      },
    };
  }, [users, usersSearchQuery, matchesUserSearch, permissionPresets, userMatchesPreset, now, ms7d, ms30d]);

  const topActiveUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.active)
      .sort((a, b) => {
        const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        return bt - at;
      })
      .slice(0, 15)
      .map((u) => ({ id: u.id, login: u.login, company_name: u.company_name ?? "", last_login_at: u.last_login_at ?? null }));
  }, [users]);

  const topActiveCustomers = useMemo(() => {
    const map = new Map<string, { customer: string; last_login_at: string | null; users_count: number }>();

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
  }, [users]);

  useEffect(() => {
    setUsersVisibleCount(USERS_PAGE_SIZE);
  }, [usersSearchQuery, usersFilterBy, usersFilterLastLogin, usersFilterActive, usersFilterPresetId]);

  const toggleSelectUser = useCallback((id: number) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUserIds([]);
    setBulkSelectedPresetId("");
  }, []);

  return {
    USERS_PAGE_SIZE,
    users,
    setUsers,
    loading,
    fetchUsers,
    lastLoginAvailable,
    topActiveExpanded,
    setTopActiveExpanded,
    topActiveMode,
    setTopActiveMode,
    usersSearchQuery,
    setUsersSearchQuery,
    usersViewMode,
    setUsersViewMode,
    expandedCustomerLabels,
    setExpandedCustomerLabels,
    usersSortBy,
    setUsersSortBy,
    usersSortOrder,
    setUsersSortOrder,
    usersFilterBy,
    setUsersFilterBy,
    usersFilterLastLogin,
    setUsersFilterLastLogin,
    usersFilterActive,
    setUsersFilterActive,
    usersFilterPresetId,
    setUsersFilterPresetId,
    usersVisibleCount,
    setUsersVisibleCount,
    deactivateConfirmUserId,
    setDeactivateConfirmUserId,
    bulkDeactivateConfirmOpen,
    setBulkDeactivateConfirmOpen,
    selectedUserIds,
    setSelectedUserIds,
    bulkPermissions,
    setBulkPermissions,
    bulkFinancial,
    setBulkFinancial,
    bulkAccessAllInns,
    setBulkAccessAllInns,
    bulkLoading,
    setBulkLoading,
    bulkError,
    setBulkError,
    bulkSelectedPresetId,
    setBulkSelectedPresetId,
    customerDirectoryMap,
    setCustomerDirectoryMap,
    matchesUserSearch,
    userMatchesPreset,
    usersFilterCounts,
    topActiveUsers,
    topActiveCustomers,
    now,
    ms7d,
    ms30d,
    toggleSelectUser,
    clearSelection,
  };
}

export type UseAdminUsersReturn = ReturnType<typeof useAdminUsers>;
