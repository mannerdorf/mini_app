import React, { useMemo, useRef } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { patchAdminUser } from "../../../api/client/admin/users";
import { filterAndSortAdminUsers } from "../lib/adminUsersListPipeline";
import { formatRelativeLoginTimeFromMs } from "../lib/adminUsersHelpers";
import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "../lib/userSearch";
import type { PermissionPreset } from "../lib/permissions";
import { AdminUserRow } from "./AdminUserRow";
import { AdminUserPermissionsEditorPanel } from "./AdminUserPermissionsEditorPanel";
import { AdminUsersBulkPermissionsPanel } from "./AdminUsersBulkPermissionsPanel";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";
import type { User } from "../types/adminUsers";

type Props = Pick<
  UseAdminUsersReturn,
  | "USERS_PAGE_SIZE"
  | "users"
  | "setUsers"
  | "loading"
  | "usersSearchQuery"
  | "usersViewMode"
  | "expandedCustomerLabels"
  | "setExpandedCustomerLabels"
  | "usersSortBy"
  | "usersSortOrder"
  | "usersFilterBy"
  | "usersFilterActive"
  | "usersFilterLastLogin"
  | "usersFilterPresetId"
  | "usersVisibleCount"
  | "setUsersVisibleCount"
  | "setDeactivateConfirmUserId"
  | "bulkDeactivateConfirmOpen"
  | "setBulkDeactivateConfirmOpen"
  | "selectedUserIds"
  | "setSelectedUserIds"
  | "bulkPermissions"
  | "setBulkPermissions"
  | "bulkFinancial"
  | "setBulkFinancial"
  | "bulkAccessAllInns"
  | "setBulkAccessAllInns"
  | "bulkLoading"
  | "bulkError"
  | "bulkSelectedPresetId"
  | "setBulkSelectedPresetId"
  | "customerDirectoryMap"
  | "matchesUserSearch"
  | "userMatchesPreset"
  | "usersFilterCounts"
  | "now"
  | "ms7d"
  | "ms30d"
  | "toggleSelectUser"
  | "clearSelection"
> & {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  permissionPresets: PermissionPreset[];
  editor: AdminUserEditorState;
  handleBulkApplyPermissions: () => Promise<void>;
  handleBulkDeactivate: () => Promise<void>;
};

export function AdminUsersListPanel(props: Props) {
  const {
    adminToken,
    isSuperAdmin,
    onError,
    permissionPresets,
    editor,
    handleBulkApplyPermissions,
    handleBulkDeactivate,
    USERS_PAGE_SIZE,
    users,
    setUsers,
    loading,
    usersSearchQuery,
    usersViewMode,
    expandedCustomerLabels,
    setExpandedCustomerLabels,
    usersSortBy,
    usersSortOrder,
    usersFilterBy,
    usersFilterActive,
    usersFilterLastLogin,
    usersFilterPresetId,
    usersVisibleCount,
    setUsersVisibleCount,
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
    bulkError,
    bulkSelectedPresetId,
    setBulkSelectedPresetId,
    customerDirectoryMap,
    matchesUserSearch,
    userMatchesPreset,
    now,
    ms7d,
    ms30d,
    toggleSelectUser,
    clearSelection,
  } = props;

  const { selectedUser, openPermissionsEditor, closePermissionsEditor } = editor;
  const bulkDeactivateModalRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  return (
    <>
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
                      const latestLoginLabel = formatRelativeLoginTimeFromMs(latestLoginMs);
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
    </>
  );
}
