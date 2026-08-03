import type { PermissionPreset } from "../lib/permissions";
import type { User } from "../types/adminUsers";

export type AdminUsersFilterBy =
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

export type FilterAndSortAdminUsersParams = {
  users: User[];
  searchQuery: string;
  filterBy: AdminUsersFilterBy;
  filterActive: "all" | "active" | "inactive";
  filterLastLogin: "all" | "7d" | "30d" | "never" | "old";
  filterPresetId: string;
  sortBy: "email" | "date" | "active";
  sortOrder: "asc" | "desc";
  visibleCount: number;
  now: number;
  ms7d: number;
  ms30d: number;
  permissionPresets: PermissionPreset[];
  matchesUserSearch: (user: User, query: string) => boolean;
  userMatchesPreset: (user: User, preset: PermissionPreset) => boolean;
};

/** Фильтрация, сортировка и пагинация списка пользователей CMS. */
export function filterAndSortAdminUsers({
  users,
  searchQuery,
  filterBy,
  filterActive,
  filterLastLogin,
  filterPresetId,
  sortBy,
  sortOrder,
  visibleCount,
  now,
  ms7d,
  ms30d,
  permissionPresets,
  matchesUserSearch,
  userMatchesPreset,
}: FilterAndSortAdminUsersParams) {
  const q = searchQuery.trim();
  let filtered = users.filter((u) => matchesUserSearch(u, q));
  if (filterBy === "cms") filtered = filtered.filter((u) => !!u.permissions?.cms_access);
  else if (filterBy === "no_cms") filtered = filtered.filter((u) => !u.permissions?.cms_access);
  else if (filterBy === "service_mode") filtered = filtered.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns);
  else if (filterBy === "supervisor") filtered = filtered.filter((u) => !!u.permissions?.supervisor);
  else if (filterBy === "no_supervisor") filtered = filtered.filter((u) => !u.permissions?.supervisor);
  else if (filterBy === "analytics") filtered = filtered.filter((u) => !!u.permissions?.analytics);
  else if (filterBy === "no_analytics") filtered = filtered.filter((u) => !u.permissions?.analytics);
  else if (filterBy === "home") filtered = filtered.filter((u) => !!u.permissions?.home);
  else if (filterBy === "no_home") filtered = filtered.filter((u) => !u.permissions?.home);
  else if (filterBy === "dashboard") filtered = filtered.filter((u) => !!u.permissions?.dashboard);
  else if (filterBy === "no_dashboard") filtered = filtered.filter((u) => !u.permissions?.dashboard);
  else if (filterBy === "sendings") filtered = filtered.filter((u) => !!u.permissions?.doc_sendings);
  else if (filterBy === "no_sendings") filtered = filtered.filter((u) => !u.permissions?.doc_sendings);
  if (filterActive === "active") filtered = filtered.filter((u) => !!u.active);
  else if (filterActive === "inactive") filtered = filtered.filter((u) => !u.active);
  if (filterLastLogin === "7d") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms7d);
  else if (filterLastLogin === "30d") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms30d);
  else if (filterLastLogin === "never") filtered = filtered.filter((u) => u.last_login_at == null);
  else if (filterLastLogin === "old") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > ms30d);
  if (filterPresetId) {
    const preset = permissionPresets.find((p) => p.id === filterPresetId);
    if (preset) filtered = filtered.filter((u) => userMatchesPreset(u, preset));
  }
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "email") cmp = (a.login || "").localeCompare(b.login || "", "ru");
    else if (sortBy === "date") cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    else cmp = (a.active ? 1 : 0) - (b.active ? 1 : 0);
    return sortOrder === "desc" ? -cmp : cmp;
  });
  const visibleSorted = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visibleCount;
  return { filtered, sorted, visibleSorted, hasMore, q };
}
