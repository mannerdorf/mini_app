import React from "react";
import { Button, Flex, Input } from "@maxhub/max-ui";
import { Plus } from "lucide-react";
import { formatDisplayDate } from "../../../lib/dateUtils";
import { filterAndSortAdminUsers } from "../lib/adminUsersListPipeline";
import type { PermissionPreset } from "../lib/permissions";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";

type Props = Pick<
  UseAdminUsersReturn,
  | "users"
  | "usersSearchQuery"
  | "setUsersSearchQuery"
  | "usersViewMode"
  | "setUsersViewMode"
  | "usersFilterBy"
  | "setUsersFilterBy"
  | "usersFilterActive"
  | "setUsersFilterActive"
  | "usersFilterLastLogin"
  | "setUsersFilterLastLogin"
  | "usersFilterPresetId"
  | "setUsersFilterPresetId"
  | "usersSortBy"
  | "setUsersSortBy"
  | "usersSortOrder"
  | "setUsersSortOrder"
  | "usersFilterCounts"
  | "matchesUserSearch"
  | "userMatchesPreset"
  | "now"
  | "ms7d"
  | "ms30d"
> & {
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  openAddUserForm: () => void;
};

export function AdminUsersToolbar({
  isSuperAdmin,
  permissionPresets,
  openAddUserForm,
  users,
  usersSearchQuery,
  setUsersSearchQuery,
  usersViewMode,
  setUsersViewMode,
  usersFilterBy,
  setUsersFilterBy,
  usersFilterActive,
  setUsersFilterActive,
  usersFilterLastLogin,
  setUsersFilterLastLogin,
  usersFilterPresetId,
  setUsersFilterPresetId,
  usersSortBy,
  setUsersSortBy,
  usersSortOrder,
  setUsersSortOrder,
  usersFilterCounts,
  matchesUserSearch,
  userMatchesPreset,
  now,
  ms7d,
  ms30d,
}: Props) {
  return (
            <Flex className="admin-users-toolbar" gap="0.75rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
              <Button
                type="button"
                className="filter-button"
                style={{ background: "var(--color-primary-blue)", color: "white", padding: "0.4rem 0.75rem", fontSize: "0.9rem" }}
                onClick={openAddUserForm}
                aria-label="Добавить пользователя — открыть форму регистрации"
              >
                <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Добавить пользователя
              </Button>
              <Flex align="center" gap="0.35rem">
                <Button
                  className="filter-button"
                  style={{ padding: "0 0.6rem", fontSize: "0.85rem", background: usersViewMode === "login" ? "var(--color-primary-blue)" : undefined, color: usersViewMode === "login" ? "white" : undefined }}
                  onClick={() => setUsersViewMode("login")}
                >
                  По логинам
                </Button>
                <Button
                  className="filter-button"
                  style={{ padding: "0 0.6rem", fontSize: "0.85rem", background: usersViewMode === "customer" ? "var(--color-primary-blue)" : undefined, color: usersViewMode === "customer" ? "white" : undefined }}
                  onClick={() => setUsersViewMode("customer")}
                >
                  По заказчикам
                </Button>
              </Flex>
              <label htmlFor="admin-users-search" className="visually-hidden">Поиск пользователей</label>
              <Input
                id="admin-users-search"
                type="text"
                placeholder="Логин, ИНН, наименование организации…"
                value={usersSearchQuery}
                onChange={(e) => setUsersSearchQuery(e.target.value)}
                className="admin-form-input"
                style={{ maxWidth: "24rem" }}
                aria-label="Поиск: логин, ИНН, наименование юрлица"
              />
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-by" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Права:</label>
                <select
                  id="users-filter-by"
                  value={usersFilterBy}
                  onChange={(e) => setUsersFilterBy(e.target.value as typeof usersFilterBy)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "11rem" }}
                  aria-label="Фильтр по правам доступа"
                >
                  <option value="all">Все ({usersFilterCounts.all})</option>
                  <option value="cms">С доступом в CMS ({usersFilterCounts.cms})</option>
                  <option value="no_cms">Без доступа в CMS ({usersFilterCounts.no_cms})</option>
                  <option value="service_mode">Со служебным режимом ({usersFilterCounts.service_mode})</option>
                  <option value="supervisor">Руководитель — с правом ({usersFilterCounts.supervisor})</option>
                  <option value="no_supervisor">Руководитель — без права ({usersFilterCounts.no_supervisor})</option>
                  <option value="analytics">Аналитика — с правом ({usersFilterCounts.analytics})</option>
                  <option value="no_analytics">Аналитика — без права ({usersFilterCounts.no_analytics})</option>
                  <option value="home">Главная — с правом ({usersFilterCounts.home})</option>
                  <option value="no_home">Без главной ({usersFilterCounts.no_home})</option>
                  <option value="dashboard">Дашборд — с правом ({usersFilterCounts.dashboard})</option>
                  <option value="no_dashboard">Без дашборда ({usersFilterCounts.no_dashboard})</option>
                  <option value="sendings">Отправки — с правом ({usersFilterCounts.sendings})</option>
                  <option value="no_sendings">Отправки — без права ({usersFilterCounts.no_sendings})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-active" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Активность:</label>
                <select
                  id="users-filter-active"
                  value={usersFilterActive}
                  onChange={(e) => setUsersFilterActive(e.target.value as "all" | "active" | "inactive")}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по активности"
                >
                  <option value="all">Все</option>
                  <option value="active">Активные ({usersFilterCounts.active})</option>
                  <option value="inactive">Неактивные ({usersFilterCounts.inactive})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-last-login" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Вход:</label>
                <select
                  id="users-filter-last-login"
                  value={usersFilterLastLogin}
                  onChange={(e) => setUsersFilterLastLogin(e.target.value as typeof usersFilterLastLogin)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по последнему входу"
                >
                  <option value="all">Все</option>
                  <option value="7d">Входили за 7 дней ({usersFilterCounts.last_login_7d})</option>
                  <option value="30d">Входили за 30 дней ({usersFilterCounts.last_login_30d})</option>
                  <option value="old">Давно не входили ({usersFilterCounts.last_login_old})</option>
                  <option value="never">Никогда не входили ({usersFilterCounts.last_login_never})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-preset" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Пресет:</label>
                <select
                  id="users-filter-preset"
                  value={usersFilterPresetId}
                  onChange={(e) => setUsersFilterPresetId(e.target.value)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по пресету прав"
                >
                  <option value="">Все</option>
                  {permissionPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({usersFilterCounts.preset(p.id)})</option>
                  ))}
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-sort" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Сортировка:</label>
                <select
                  id="users-sort"
                  value={`${usersSortBy}-${usersSortOrder}`}
                  onChange={(e) => {
                    const [by, order] = (e.target.value as string).split("-") as [typeof usersSortBy, typeof usersSortOrder];
                    setUsersSortBy(by);
                    setUsersSortOrder(order);
                  }}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Сортировка списка пользователей"
                >
                  <option value="email-asc">По email (А–Я)</option>
                  <option value="email-desc">По email (Я–А)</option>
                  <option value="date-desc">По дате (новые)</option>
                  <option value="date-asc">По дате (старые)</option>
                  <option value="active-desc">Сначала активные</option>
                  <option value="active-asc">Сначала неактивные</option>
                </select>
              </Flex>
              {isSuperAdmin && (
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => {
                    const { sorted: list } = filterAndSortAdminUsers({
                      users,
                      searchQuery: usersSearchQuery,
                      filterBy: usersFilterBy,
                      filterActive: usersFilterActive,
                      filterLastLogin: usersFilterLastLogin,
                      filterPresetId: usersFilterPresetId,
                      sortBy: usersSortBy,
                      sortOrder: usersSortOrder,
                      visibleCount: users.length,
                      now,
                      ms7d,
                      ms30d,
                      permissionPresets,
                      matchesUserSearch,
                      userMatchesPreset,
                    });
                    const rows = list.map((u) => {
                      const customers = u.companies?.length ? u.companies.map((c) => `${c.name || ""} (${c.inn})`).join("; ") : (u.inn ? `${u.company_name || ""} (${u.inn})` : "");
                      const perms = u.permissions && typeof u.permissions === "object" ? Object.entries(u.permissions).filter(([, v]) => v).map(([k]) => k).join("; ") : "";
                      return [u.login, customers, perms, u.active ? "да" : "нет", u.created_at ? formatDisplayDate(u.created_at) : ""];
                    });
                    const header = ["Логин", "Заказчики", "Права", "Активен", "Дата регистрации"];
                    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `пользователи_${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  Выгрузить в CSV
                </Button>
              )}
            </Flex>
  );
}
