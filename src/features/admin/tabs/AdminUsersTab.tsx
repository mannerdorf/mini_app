import React from "react";
import { Panel } from "@maxhub/max-ui";
import { CustomerPickModal } from "../../../components/modals/CustomerPickModal";
import { AdminUserAddFormPanel } from "../components/AdminUserAddFormPanel";
import { AdminUserDeactivateModal } from "../components/AdminUserDeactivateModal";
import { AdminUsersTopActivePanel } from "../components/AdminUsersTopActivePanel";
import { AdminUsersToolbar } from "../components/AdminUsersToolbar";
import { AdminUsersListPanel } from "../components/AdminUsersListPanel";
import { useAdminUserEditor } from "../hooks/useAdminUserEditor";
import { useAdminUserRegistration } from "../hooks/useAdminUserRegistration";
import { useAdminUsersBulkActions } from "../hooks/useAdminUsersBulkActions";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";
import type { PermissionPreset } from "../lib/permissions";

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
  users,
  setUsers,
  fetchUsers,
  deactivateConfirmUserId,
  setDeactivateConfirmUserId,
  setCustomerDirectoryMap,
  ...usersState
}: AdminUsersTabProps) {
  const registration = useAdminUserRegistration({
    adminToken,
    isSuperAdmin,
    users,
    usersSearchQuery: usersState.usersSearchQuery,
    matchesUserSearch: usersState.matchesUserSearch,
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
    editorCustomerPickOpen,
    setEditorCustomerPickOpen,
    setEditorCustomers,
  } = editor;

  const { handleBulkApplyPermissions, handleBulkDeactivate } = useAdminUsersBulkActions({
    adminToken,
    isSuperAdmin,
    users,
    selectedUserIds: usersState.selectedUserIds,
    bulkPermissions: usersState.bulkPermissions,
    bulkFinancial: usersState.bulkFinancial,
    bulkAccessAllInns: usersState.bulkAccessAllInns,
    fetchUsers,
    setBulkLoading: usersState.setBulkLoading,
    setBulkError: usersState.setBulkError,
    setSelectedUserIds: usersState.setSelectedUserIds,
    setBulkSelectedPresetId: usersState.setBulkSelectedPresetId,
    setBulkDeactivateConfirmOpen: usersState.setBulkDeactivateConfirmOpen,
  });

  const deactivateUser = deactivateConfirmUserId != null
    ? users.find((x) => x.id === deactivateConfirmUserId)
    : null;

  return (
    <>
      {deactivateUser && (
        <AdminUserDeactivateModal
          user={deactivateUser}
          adminToken={adminToken}
          onError={onError}
          onClose={() => setDeactivateConfirmUserId(null)}
          onDeactivated={(userId) => {
            setUsers((prev) => prev.map((x) => (x.id === userId ? { ...x, active: false } : x)));
          }}
        />
      )}

      <AdminUsersTopActivePanel
        topActiveExpanded={usersState.topActiveExpanded}
        setTopActiveExpanded={usersState.setTopActiveExpanded}
        topActiveMode={usersState.topActiveMode}
        setTopActiveMode={usersState.setTopActiveMode}
        lastLoginAvailable={usersState.lastLoginAvailable}
        loading={usersState.loading}
        topActiveUsers={usersState.topActiveUsers}
        topActiveCustomers={usersState.topActiveCustomers}
      />

      <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
        <AdminUsersToolbar
          isSuperAdmin={isSuperAdmin}
          permissionPresets={permissionPresets}
          openAddUserForm={openAddUserForm}
          users={users}
          usersSearchQuery={usersState.usersSearchQuery}
          setUsersSearchQuery={usersState.setUsersSearchQuery}
          usersViewMode={usersState.usersViewMode}
          setUsersViewMode={usersState.setUsersViewMode}
          usersFilterBy={usersState.usersFilterBy}
          setUsersFilterBy={usersState.setUsersFilterBy}
          usersFilterActive={usersState.usersFilterActive}
          setUsersFilterActive={usersState.setUsersFilterActive}
          usersFilterLastLogin={usersState.usersFilterLastLogin}
          setUsersFilterLastLogin={usersState.setUsersFilterLastLogin}
          usersFilterPresetId={usersState.usersFilterPresetId}
          setUsersFilterPresetId={usersState.setUsersFilterPresetId}
          usersSortBy={usersState.usersSortBy}
          setUsersSortBy={usersState.setUsersSortBy}
          usersSortOrder={usersState.usersSortOrder}
          setUsersSortOrder={usersState.setUsersSortOrder}
          usersFilterCounts={usersState.usersFilterCounts}
          matchesUserSearch={usersState.matchesUserSearch}
          userMatchesPreset={usersState.userMatchesPreset}
          now={usersState.now}
          ms7d={usersState.ms7d}
          ms30d={usersState.ms30d}
        />
        <AdminUsersListPanel
          adminToken={adminToken}
          isSuperAdmin={isSuperAdmin}
          onError={onError}
          permissionPresets={permissionPresets}
          editor={editor}
          handleBulkApplyPermissions={handleBulkApplyPermissions}
          handleBulkDeactivate={handleBulkDeactivate}
          USERS_PAGE_SIZE={usersState.USERS_PAGE_SIZE}
          users={users}
          setUsers={setUsers}
          loading={usersState.loading}
          usersSearchQuery={usersState.usersSearchQuery}
          usersViewMode={usersState.usersViewMode}
          expandedCustomerLabels={usersState.expandedCustomerLabels}
          setExpandedCustomerLabels={usersState.setExpandedCustomerLabels}
          usersSortBy={usersState.usersSortBy}
          usersSortOrder={usersState.usersSortOrder}
          usersFilterBy={usersState.usersFilterBy}
          usersFilterActive={usersState.usersFilterActive}
          usersFilterLastLogin={usersState.usersFilterLastLogin}
          usersFilterPresetId={usersState.usersFilterPresetId}
          usersVisibleCount={usersState.usersVisibleCount}
          setUsersVisibleCount={usersState.setUsersVisibleCount}
          setDeactivateConfirmUserId={setDeactivateConfirmUserId}
          bulkDeactivateConfirmOpen={usersState.bulkDeactivateConfirmOpen}
          setBulkDeactivateConfirmOpen={usersState.setBulkDeactivateConfirmOpen}
          selectedUserIds={usersState.selectedUserIds}
          setSelectedUserIds={usersState.setSelectedUserIds}
          bulkPermissions={usersState.bulkPermissions}
          setBulkPermissions={usersState.setBulkPermissions}
          bulkFinancial={usersState.bulkFinancial}
          setBulkFinancial={usersState.setBulkFinancial}
          bulkAccessAllInns={usersState.bulkAccessAllInns}
          setBulkAccessAllInns={usersState.setBulkAccessAllInns}
          bulkLoading={usersState.bulkLoading}
          bulkError={usersState.bulkError}
          bulkSelectedPresetId={usersState.bulkSelectedPresetId}
          setBulkSelectedPresetId={usersState.setBulkSelectedPresetId}
          customerDirectoryMap={usersState.customerDirectoryMap}
          matchesUserSearch={usersState.matchesUserSearch}
          userMatchesPreset={usersState.userMatchesPreset}
          usersFilterCounts={usersState.usersFilterCounts}
          now={usersState.now}
          ms7d={usersState.ms7d}
          ms30d={usersState.ms30d}
          toggleSelectUser={usersState.toggleSelectUser}
          clearSelection={usersState.clearSelection}
        />
      </Panel>

      {showAddUserForm && (
        <AdminUserAddFormPanel
          isSuperAdmin={isSuperAdmin}
          permissionPresets={permissionPresets}
          customerDirectoryMap={usersState.customerDirectoryMap}
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
