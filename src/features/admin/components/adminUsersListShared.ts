import type { RefObject } from "react";
import type { PermissionPreset } from "../lib/permissions";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";
import type { User } from "../types/adminUsers";

export type AdminUsersListSharedProps = Pick<
  UseAdminUsersReturn,
  | "USERS_PAGE_SIZE"
  | "users"
  | "setUsers"
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
  sorted: User[];
  visibleSorted: User[];
  hasMore: boolean;
  bulkDeactivateModalRef: RefObject<HTMLDivElement | null>;
};

export type AdminUsersListPanelProps = Omit<
  AdminUsersListSharedProps,
  "sorted" | "visibleSorted" | "hasMore" | "bulkDeactivateModalRef"
> & Pick<
  UseAdminUsersReturn,
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
  | "matchesUserSearch"
  | "userMatchesPreset"
  | "now"
  | "ms7d"
  | "ms30d"
>;
