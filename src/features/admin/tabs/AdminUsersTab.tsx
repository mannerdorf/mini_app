import React, { useCallback, useMemo, useRef } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";
import { CustomerPickModal } from "../../../components/modals/CustomerPickModal";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import { patchAdminUser } from "../../../api/client/admin/users";
import {
  permissionsForAdminEditor,
  type PermissionPreset,
} from "../lib/permissions";
import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "../lib/userSearch";
import { AdminUserRow } from "../components/AdminUserRow";
import { AdminUserPermissionsEditorPanel } from "../components/AdminUserPermissionsEditorPanel";
import { AdminUsersBulkPermissionsPanel } from "../components/AdminUsersBulkPermissionsPanel";
import { AdminUserAddFormPanel } from "../components/AdminUserAddFormPanel";
import { filterAndSortAdminUsers } from "../lib/adminUsersListPipeline";
import { useAdminUserEditor } from "../hooks/useAdminUserEditor";
import { useAdminUserRegistration } from "../hooks/useAdminUserRegistration";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";
import type { User } from "../types/adminUsers";

type AdminUsersTabProps = UseAdminUsersReturn & {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  permissionPresets: PermissionPreset[];
};

export function AdminUsersTab({
  adminToken,
  isSuperAdmin,
  onError,
  permissionPresets,
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
}: AdminUsersTabProps) {
  const registration = useAdminUserRegistration({
    adminToken,
    isSuperAdmin,
    users,
    usersSearchQuery,
    matchesUserSearch,
    onError,
    fetchUsers,
  });
  const {
    showAddUserForm,
    setShowAddUserForm,
    customerPickModalOpen,
    setCustomerPickModalOpen,
    fetchCustomersForModal,
    addSelectedCustomer,
    openAddUserForm,
  } = registration;

  const editor = useAdminUserEditor({
    adminToken,
    isSuperAdmin,
    fetchUsers,
    setUsers,
    setCustomerDirectoryMap,
  });
  const {
    selectedUser,
    setEditorCustomers,
    editorCustomerPickOpen,
    setEditorCustomerPickOpen,
    openPermissionsEditor,
    closePermissionsEditor,
  } = editor;

  const deactivateModalRef = useRef<HTMLDivElement>(null);
  const bulkDeactivateModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(deactivateModalRef, deactivateConfirmUserId != null, () => setDeactivateConfirmUserId(null));
  useFocusTrap(bulkDeactivateModalRef, bulkDeactivateConfirmOpen, () => !bulkLoading && setBulkDeactivateConfirmOpen(false));

  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const handleBulkApplyPermissions = useCallback(async () => {
    if (selectedUserIds.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    const failed: { id: number; error: string }[] = [];
    for (const id of selectedUserIds) {
      const user = users.find((u) => u.id === id);
      const body = {
        permissions: permissionsForAdminEditor(isSuperAdmin, bulkPermissions, user?.permissions),
        financial_access: bulkFinancial,
        access_all_inns: isSuperAdmin
          ? bulkAccessAllInns
          : Boolean(user?.access_all_inns ?? user?.permissions?.service_mode),
      };
      try {
        await patchAdminUser(adminToken, id, body);
      } catch (e) {
        failed.push({ id, error: (e as Error)?.message || "Ошибка" });
      }
    }
    await fetchUsers();
    setBulkLoading(false);
    if (failed.length > 0) {
      setBulkError(`Не удалось применить к ${failed.length}: ${failed.slice(0, 3).map((f) => f.id).join(", ")}${failed.length > 3 ? "…" : ""}`);
    } else {
      setSelectedUserIds([]);
    }
  }, [selectedUserIds, bulkPermissions, bulkFinancial, bulkAccessAllInns, adminToken, fetchUsers, isSuperAdmin, users, setBulkLoading, setBulkError, setSelectedUserIds]);

  const handleBulkDeactivate = useCallback(async () => {
    if (selectedUserIds.length === 0) return;
    setBulkDeactivateConfirmOpen(false);
    setBulkLoading(true);
    setBulkError(null);
    const failed: { id: number; error: string }[] = [];
    for (const id of selectedUserIds) {
      try {
        await patchAdminUser(adminToken, id, { active: false });
      } catch (e) {
        failed.push({ id, error: (e as Error)?.message || "Ошибка" });
      }
    }
    await fetchUsers();
    setBulkLoading(false);
    if (failed.length > 0) {
      setBulkError(`Не удалось деактивировать: ${failed.length}. ${failed.slice(0, 3).map((f) => f.id).join(", ")}${failed.length > 3 ? "…" : ""}`);
    } else {
      setSelectedUserIds([]);
      setBulkSelectedPresetId("");
    }
  }, [selectedUserIds, adminToken, fetchUsers, setBulkDeactivateConfirmOpen, setBulkLoading, setBulkError, setSelectedUserIds, setBulkSelectedPresetId]);

  return (
    <>
        <>
          {deactivateConfirmUserId != null && (() => {
            const u = users.find((x) => x.id === deactivateConfirmUserId);
            return u ? (
              <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setDeactivateConfirmUserId(null)} role="dialog" aria-modal="true" aria-labelledby="deactivate-user-title">
                <div ref={deactivateModalRef} onClick={(e) => e.stopPropagation()}>
                <Panel className="cargo-card" style={{ maxWidth: "24rem", margin: "2rem auto", padding: "var(--pad-card, 1rem)" }}>
                  <Typography.Body id="deactivate-user-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Деактивировать пользователя?</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                    {u.login} не сможет войти в приложение.
                  </Typography.Body>
                  <Flex gap="0.5rem">
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "var(--color-error, #dc2626)", color: "white" }}
                      aria-label="Деактивировать пользователя"
                      onClick={async () => {
                        try {
                          await patchAdminUser(adminToken, u.id, { active: false });
                          setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: false } : x)));
                        } catch (e: unknown) {
                          onError((e as Error)?.message || "Ошибка обновления");
                        }
                        setDeactivateConfirmUserId(null);
                      }}
                    >
                      Деактивировать
                    </Button>
                    <Button type="button" className="filter-button" onClick={() => setDeactivateConfirmUserId(null)} aria-label="Отмена">
                      Отмена
                    </Button>
                  </Flex>
                </Panel>
                </div>
              </div>
            ) : null;
          })()}
          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
            <button
              type="button"
              onClick={() => setTopActiveExpanded((e) => !e)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginBottom: topActiveExpanded ? "0.5rem" : 0,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
              }}
              aria-expanded={topActiveExpanded}
              aria-label={topActiveExpanded ? "Свернуть топ активных пользователей" : "Развернуть топ активных пользователей"}
            >
              {topActiveExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Activity className="w-4 h-4" />
              <Typography.Body style={{ fontWeight: 600 }}>Топ активных пользователей</Typography.Body>
            </button>
            {topActiveExpanded && (
              <>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                  По последнему входу в приложение
                </Typography.Body>
                <Flex align="center" gap="0.35rem" style={{ marginBottom: "0.5rem" }}>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "users" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "users" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("users")}
                  >
                    Пользователи
                  </Button>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "customers" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "customers" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("customers")}
                  >
                    Заказчики
                  </Button>
                </Flex>
                {!lastLoginAvailable && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
                    Колонка last_login_at отсутствует в БД. Выполните миграцию 015 (migrations/015_registered_users_last_login.sql) — тогда время входа будет сохраняться при входе по email/пароль.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "users" && topActiveUsers.length > 0 && topActiveUsers.every((u) => !u.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "customers" && topActiveCustomers.length > 0 && topActiveCustomers.every((c) => !c.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи компаний войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {loading ? (
                  <Flex align="center" gap="0.5rem">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
                  </Flex>
                ) : (topActiveMode === "users" ? topActiveUsers.length === 0 : topActiveCustomers.length === 0) ? (
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                    {topActiveMode === "users"
                      ? "Нет активных пользователей. Данные о входах появятся после входа через CMS."
                      : "Нет активных заказчиков. Данные о входах появятся после входа через CMS."}
                  </Typography.Body>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(topActiveMode === "users" ? topActiveUsers : topActiveCustomers).map((u, i) => {
                      const now = Date.now();
                      const lastMs = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
                      const diffMs = lastMs ? now - lastMs : Infinity;
                      const ms30d = 30 * 24 * 3600 * 1000;
                      const freshness = diffMs >= ms30d ? 0 : Math.max(0, 1 - diffMs / ms30d);
                      const accentOpacity = Math.min(0.5, 0.12 + freshness * 0.38);
                      const timeLabel = u.last_login_at
                        ? (() => {
                            const d = new Date(u.last_login_at);
                            const nowDate = new Date();
                            const dMs = nowDate.getTime() - d.getTime();
                            const diffM = Math.floor(dMs / 60000);
                            const diffH = Math.floor(dMs / 3600000);
                            const diffD = Math.floor(dMs / 86400000);
                            if (diffM < 1) return "только что";
                            if (diffM < 60) return `${diffM} мин назад`;
                            if (diffH < 24) return `${diffH} ч назад`;
                            if (diffD < 7) return `${diffD} дн назад`;
                            return formatDisplayDateFromDate(d);
                          })()
                        : "никогда";
                      return (
                      <div
                        key={"id" in u ? u.id : `customer-${u.customer}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.55rem 0.65rem",
                          background: "var(--color-bg-hover)",
                          border: "1px solid var(--color-border)",
                          borderLeft: `4px solid rgba(0, 113, 227, ${accentOpacity})`,
                          borderRadius: 8,
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--color-text-primary)" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 22,
                              height: 22,
                              marginRight: 8,
                              borderRadius: 999,
                              fontSize: "0.75rem",
                              background: "var(--color-bg-card)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {i + 1}
                          </span>
                          {"login" in u ? u.login : u.customer}
                          {"users_count" in u ? ` (${u.users_count})` : ""}
                        </span>
                        <Typography.Body
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--color-text-secondary)",
                            marginLeft: "0.5rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: 999,
                            background: "var(--color-bg-card)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          {timeLabel}
                        </Typography.Body>
                      </div>
                    ); })}
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
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
            {loading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка...</Typography.Body>
              </Flex>
            ) : users.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет зарегистрированных пользователей</Typography.Body>
            ) : (() => {
              const { sorted, visibleSorted, hasMore, q } = filterAndSortAdminUsers({
                users,
                searchQuery: usersSearchQuery,
                filterBy: usersFilterBy,
                filterActive: usersFilterActive,
                filterLastLogin: usersFilterLastLogin,
                filterPresetId: usersFilterPresetId,
                sortBy: usersSortBy,
                sortOrder: usersSortOrder,
                visibleCount: usersVisibleCount,
                now,
                ms7d,
                ms30d,
                permissionPresets,
                matchesUserSearch,
                userMatchesPreset,
              });
              const togglePermissionsEditor = (u: User) => {
                if (selectedUser?.id === u.id) closePermissionsEditor();
                else openPermissionsEditor(u);
              };
              const permissionsEditorPanel = selectedUser ? (
                <AdminUserPermissionsEditorPanel
                  user={selectedUser}
                  isSuperAdmin={isSuperAdmin}
                  permissionPresets={permissionPresets}
                  customerDirectoryMap={customerDirectoryMap}
                  editor={editor}
                />
              ) : null;
              const performSetActive = async (u: User, next: boolean) => {
                try {
                  await patchAdminUser(adminToken, u.id, { active: next });
                  setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: next } : x)));
                  setDeactivateConfirmUserId(null);
                } catch (e: unknown) {
                  onError((e as Error)?.message || "Ошибка обновления");
                }
              };
              const selectAllOnPage = () => setSelectedUserIds((prev) => { const s = new Set(prev); visibleSorted.forEach((u) => s.add(u.id)); return [...s]; });
              const selectAllByFilter = () => setSelectedUserIds((prev) => {
                const s = new Set(prev);
                sorted.forEach((u) => s.add(u.id));
                return [...s];
              });
              const renderUserBlock = (u: User, rank?: number) => (
                <div key={u.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(u.id)}
                    onChange={() => toggleSelectUser(u.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: "0.9rem", flexShrink: 0, cursor: "pointer" }}
                    aria-label={`Выбрать ${u.login ?? u.id}`}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 }}>
                    <AdminUserRow
                      user={u}
                      rank={rank}
                      onToggleActive={async () => {
                        const next = !u.active;
                        if (next === false) {
                          setDeactivateConfirmUserId(u.id);
                          return;
                        }
                        await performSetActive(u, true);
                      }}
                      onEditPermissions={() => togglePermissionsEditor(u)}
                    />
                    {selectedUser?.id === u.id && permissionsEditorPanel}
                  </div>
                </div>
              );
              const bulkPanel = (
                <AdminUsersBulkPermissionsPanel
                  selectedUserIds={selectedUserIds}
                  isSuperAdmin={isSuperAdmin}
                  permissionPresets={permissionPresets}
                  bulkPermissions={bulkPermissions}
                  setBulkPermissions={setBulkPermissions}
                  bulkFinancial={bulkFinancial}
                  setBulkFinancial={setBulkFinancial}
                  bulkAccessAllInns={bulkAccessAllInns}
                  setBulkAccessAllInns={setBulkAccessAllInns}
                  bulkSelectedPresetId={bulkSelectedPresetId}
                  setBulkSelectedPresetId={setBulkSelectedPresetId}
                  bulkError={bulkError}
                  bulkLoading={bulkLoading}
                  bulkDeactivateConfirmOpen={bulkDeactivateConfirmOpen}
                  setBulkDeactivateConfirmOpen={setBulkDeactivateConfirmOpen}
                  bulkDeactivateModalRef={bulkDeactivateModalRef}
                  handleBulkApplyPermissions={handleBulkApplyPermissions}
                  handleBulkDeactivate={handleBulkDeactivate}
                  clearSelection={clearSelection}
                />
              );
              if (usersViewMode === "login") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Flex gap="0.5rem" align="center" style={{ flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выбрать:</Typography.Body>
                      <Button type="button" className="filter-button" onClick={selectAllOnPage} style={{ padding: "0.35rem 0.6rem" }}>Все на странице</Button>
                      <Button type="button" className="filter-button" onClick={selectAllByFilter} style={{ padding: "0.35rem 0.6rem" }}>Все по фильтру</Button>
                      <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                      {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                    </Flex>
                    {bulkPanel}
                    {visibleSorted.length === 0 ? (
                      <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пользователей по запросу</Typography.Body>
                    ) : (
                      visibleSorted.map((u, i) => renderUserBlock(u, i))
                    )}
                    {hasMore && (
                      <Button type="button" className="filter-button" onClick={() => setUsersVisibleCount((n) => n + USERS_PAGE_SIZE)} style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}>
                        Показать ещё (показано {visibleSorted.length} из {sorted.length})
                      </Button>
                    )}
                    {!hasMore && sorted.length > USERS_PAGE_SIZE && (
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                        Показано {sorted.length} из {sorted.length}
                      </Typography.Body>
                    )}
                  </div>
                );
              }
              const CUSTOMER_ALL = "Доступ ко всем заказчикам";
              const groups = new Map<string, User[]>();
              const companyRowMatchesSearch = (c: { inn?: string; name?: string }) => {
                if (!q) return true;
                return innMatchesSearchQuery(c.inn, q) || legalEntityNameMatchesQuery(c.name || "", q);
              };
              const addToGroup = (label: string, user: User) => {
                const list = groups.get(label) ?? [];
                if (!list.some((x) => x.id === user.id)) list.push(user);
                groups.set(label, list);
              };
              for (const u of visibleSorted) {
                // Логины с доступом ко всем заказчикам всегда показываем только в отдельной группе,
                // чтобы не дублировать их в каждой группе заказчиков.
                if (u.access_all_inns || !!u.permissions?.service_mode) {
                  addToGroup(CUSTOMER_ALL, u);
                  continue;
                }
                let placed = false;
                if (u.companies && u.companies.length > 0) {
                  for (const c of u.companies) {
                    if (!companyRowMatchesSearch(c)) continue;
                    const label = c.name?.trim() ? `${c.name} (${c.inn})` : c.inn;
                    addToGroup(label, u);
                    placed = true;
                  }
                  if (!placed) addToGroup(CUSTOMER_ALL, u);
                } else if (u.inn) {
                  if (companyRowMatchesSearch({ inn: u.inn, name: u.company_name || "" })) {
                    const label = u.company_name?.trim() ? `${u.company_name} (${u.inn})` : u.inn;
                    addToGroup(label, u);
                  } else {
                    addToGroup(CUSTOMER_ALL, u);
                  }
                } else {
                  addToGroup(CUSTOMER_ALL, u);
                }
              }
              const sortedLabels = Array.from(groups.keys()).sort((a, b) => (a === CUSTOMER_ALL ? 1 : b === CUSTOMER_ALL ? -1 : a.localeCompare(b)));
              const groupDisplayName = (l: string) => {
                if (l === CUSTOMER_ALL) return l;
                const inParens = /\((\d{10,12})\)$/.exec(l);
                const inn = inParens ? inParens[1] : /^\d{10,12}$/.test(l) ? l : null;
                if (inn && customerDirectoryMap[inn]) return `${customerDirectoryMap[inn]} (${inn})`;
                return l;
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <Flex gap="0.5rem" align="center" style={{ flexWrap: "wrap", marginBottom: "0.25rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выбрать:</Typography.Body>
                    <Button type="button" className="filter-button" onClick={selectAllOnPage} style={{ padding: "0.35rem 0.6rem" }}>Все на странице</Button>
                    <Button type="button" className="filter-button" onClick={selectAllByFilter} style={{ padding: "0.35rem 0.6rem" }}>Все по фильтру</Button>
                    <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                    {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                  </Flex>
                  {bulkPanel}
                  {sortedLabels.length === 0 ? (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пользователей по запросу</Typography.Body>
                  ) : (
                    sortedLabels.map((label) => {
                      const groupUsers = groups.get(label) ?? [];
                      const activeCount = groupUsers.filter((u) => u.active).length;
                      const inactiveCount = Math.max(0, groupUsers.length - activeCount);
                      const latestLoginMs = groupUsers.reduce((max, u) => {
                        const ms = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
                        return Number.isFinite(ms) && ms > max ? ms : max;
                      }, 0);
                      const latestLoginLabel = latestLoginMs
                        ? (() => {
                            const now = Date.now();
                            const diffM = Math.floor((now - latestLoginMs) / 60000);
                            const diffH = Math.floor((now - latestLoginMs) / 3600000);
                            const diffD = Math.floor((now - latestLoginMs) / 86400000);
                            if (diffM < 1) return "только что";
                            if (diffM < 60) return `${diffM} мин назад`;
                            if (diffH < 24) return `${diffH} ч назад`;
                            if (diffD < 7) return `${diffD} дн назад`;
                            return formatDisplayDate(new Date(latestLoginMs).toISOString());
                          })()
                        : "нет входов";
                      const isExpanded = expandedCustomerLabels.has(label);
                      const toggleExpand = () => setExpandedCustomerLabels((prev) => {
                        const next = new Set(prev);
                        if (next.has(label)) next.delete(label);
                        else next.add(label);
                        return next;
                      });
                      return (
                        <div key={label} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggleExpand}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(); } }}
                            style={{
                              padding: "0.7rem 0.8rem",
                              border: "1px solid var(--color-border)",
                              borderRadius: "8px",
                              background: "var(--color-bg-hover)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                              borderLeft: `4px solid rgba(0, 113, 227, ${label === CUSTOMER_ALL ? 0.14 : 0.28})`,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Typography.Body style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{groupDisplayName(label)}</Typography.Body>
                              <Flex gap="0.35rem" align="center" wrap="wrap" style={{ marginTop: "0.3rem" }}>
                                <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                                  Логины: {groupUsers.length}
                                </Typography.Body>
                                <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                                  Активные: {activeCount}
                                </Typography.Body>
                                {inactiveCount > 0 && (
                                  <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                                    Неактивные: {inactiveCount}
                                  </Typography.Body>
                                )}
                                <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                                  Последний вход: {latestLoginLabel}
                                </Typography.Body>
                              </Flex>
                            </div>
                            {isExpanded ? <ChevronDown size={20} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} /> : <ChevronRight size={20} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />}
                          </div>
                          {isExpanded && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingLeft: "0.5rem" }}>
                              {groupUsers.map((u, i) => renderUserBlock(u, i))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {hasMore && (
                    <Button type="button" className="filter-button" onClick={() => setUsersVisibleCount((n) => n + USERS_PAGE_SIZE)} style={{ alignSelf: "flex-start" }}>
                      Показать ещё (показано {visibleSorted.length} из {sorted.length})
                    </Button>
                  )}
                  {!hasMore && sorted.length > USERS_PAGE_SIZE && (
                    <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      Показано {sorted.length} из {sorted.length}
                    </Typography.Body>
                  )}
                </div>
              );
            })()}
          </Panel>
        </>

        {showAddUserForm && (
        <AdminUserAddFormPanel
          isSuperAdmin={isSuperAdmin}
          permissionPresets={permissionPresets}
          customerDirectoryMap={customerDirectoryMap}
          registration={registration}
          onClose={() => setShowAddUserForm(false)}
        />
      )}
      <CustomerPickModal
        isOpen={customerPickModalOpen}
        onClose={() => setCustomerPickModalOpen(false)}
        onSelect={(c) => addSelectedCustomer(c)}
        fetchCustomers={fetchCustomersForModal}
      />
      <CustomerPickModal
        isOpen={editorCustomerPickOpen}
        onClose={() => setEditorCustomerPickOpen(false)}
        onSelect={(c) => {
          setEditorCustomers((prev) => (prev.some((x) => x.inn === c.inn) ? prev : [...prev, c]));
        }}
        fetchCustomers={fetchCustomersForModal}
      />
    </>
  );
}
