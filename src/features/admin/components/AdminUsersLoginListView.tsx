import React, { useMemo } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { patchAdminUser } from "../../../api/client/admin/users";
import { AdminUserRow } from "./AdminUserRow";
import { AdminUserPermissionsEditorPanel } from "./AdminUserPermissionsEditorPanel";
import { AdminUsersBulkPermissionsPanel } from "./AdminUsersBulkPermissionsPanel";
import { AdminUsersSelectionBar } from "./AdminUsersSelectionBar";
import type { AdminUsersListSharedProps } from "./adminUsersListShared";
import type { User } from "../types/adminUsers";

export function AdminUsersLoginListView(props: AdminUsersListSharedProps) {
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

  const togglePermissionsEditor = (u: User) => {
    if (selectedUser?.id === u.id) closePermissionsEditor();
    else openPermissionsEditor(u);
  };

  const permissionsEditorPanel = selectedUser ? (
    <AdminUserPermissionsEditorPanel
      user={selectedUser}
      isSuperAdmin={isSuperAdmin}
      permissionPresets={permissionPresets ?? []}
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <AdminUsersSelectionBar
        selectedCount={selectedUserIds.length}
        onSelectAllOnPage={selectAllOnPage}
        onSelectAllByFilter={selectAllByFilter}
        onClearSelection={clearSelection}
      />
      <AdminUsersBulkPermissionsPanel
        selectedUserIds={selectedUserIds}
        isSuperAdmin={isSuperAdmin}
        permissionPresets={permissionPresets ?? []}
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
