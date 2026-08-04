import React, { useMemo } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { patchAdminUser } from "../../../api/client/admin/users";
import {
  CUSTOMER_ALL_LABEL,
  adminUsersCustomerGroupDisplayName,
  buildAdminUsersCustomerGroups,
  sortAdminUsersCustomerGroupLabels,
} from "../lib/adminUsersCustomerGroups";
import { formatRelativeLoginTimeFromMs } from "../lib/adminUsersHelpers";
import { AdminUserRow } from "./AdminUserRow";
import { AdminUserPermissionsEditorPanel } from "./AdminUserPermissionsEditorPanel";
import { AdminUsersBulkPermissionsPanel } from "./AdminUsersBulkPermissionsPanel";
import { AdminUsersSelectionBar } from "./AdminUsersSelectionBar";
import type { AdminUsersListSharedProps } from "./adminUsersListShared";
import type { User } from "../types/adminUsers";

type Props = AdminUsersListSharedProps & {
  usersSearchQuery: string;
  expandedCustomerLabels: Set<string>;
  setExpandedCustomerLabels: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export function AdminUsersCustomerGroupsView(props: Props) {
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
    sorted,
    visibleSorted,
    hasMore,
    usersSearchQuery,
    expandedCustomerLabels,
    setExpandedCustomerLabels,
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
    bulkDeactivateModalRef,
    toggleSelectUser,
    clearSelection,
  } = props;

  const { selectedUser, openPermissionsEditor, closePermissionsEditor } = editor;
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const groups = useMemo(
    () => buildAdminUsersCustomerGroups({ users: visibleSorted, searchQuery: usersSearchQuery }),
    [visibleSorted, usersSearchQuery],
  );
  const sortedLabels = useMemo(() => sortAdminUsersCustomerGroupLabels(Array.from(groups.keys())), [groups]);

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
  const selectAllByFilter = () => setSelectedUserIds((prev) => { const s = new Set(prev); sorted.forEach((u) => s.add(u.id)); return [...s]; });

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <AdminUsersSelectionBar
        selectedCount={selectedUserIds.length}
        onSelectAllOnPage={selectAllOnPage}
        onSelectAllByFilter={selectAllByFilter}
        onClearSelection={clearSelection}
      />
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
                  borderLeft: `4px solid rgba(0, 113, 227, ${label === CUSTOMER_ALL_LABEL ? 0.14 : 0.28})`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Body style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {adminUsersCustomerGroupDisplayName(label, customerDirectoryMap)}
                  </Typography.Body>
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
}
