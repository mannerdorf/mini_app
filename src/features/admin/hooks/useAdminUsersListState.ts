import { useCallback, useEffect, useMemo, useState } from "react";
import { createDefaultPermissions } from "../lib/permissions";
import {
  USERS_PAGE_SIZE,
  MS_7D,
  MS_30D,
  matchesAdminUserSearch,
  adminUserMatchesPreset,
  computeUsersFilterCounts,
  computeTopActiveUsers,
  computeTopActiveCustomers,
  type UsersFilterBy,
} from "../lib/adminUsersFilterPipeline";
import type { PermissionPreset } from "../lib/permissions";
import type { User } from "../types/adminUsers";

type Params = {
  users: User[];
  permissionPresets: PermissionPreset[];
};

export function useAdminUsersListState({ users, permissionPresets }: Params) {
  const [topActiveExpanded, setTopActiveExpanded] = useState(false);
  const [topActiveMode, setTopActiveMode] = useState<"users" | "customers">("users");
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [usersViewMode, setUsersViewMode] = useState<"login" | "customer">("login");
  const [expandedCustomerLabels, setExpandedCustomerLabels] = useState<Set<string>>(new Set());
  const [usersSortBy, setUsersSortBy] = useState<"email" | "date" | "active">("email");
  const [usersSortOrder, setUsersSortOrder] = useState<"asc" | "desc">("asc");
  const [usersFilterBy, setUsersFilterBy] = useState<UsersFilterBy>("all");
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

  const now = Date.now();

  const usersFilterCounts = useMemo(
    () => computeUsersFilterCounts(users, usersSearchQuery, permissionPresets, now),
    [users, usersSearchQuery, permissionPresets, now],
  );

  const topActiveUsers = useMemo(() => computeTopActiveUsers(users), [users]);
  const topActiveCustomers = useMemo(() => computeTopActiveCustomers(users), [users]);

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
    matchesUserSearch: matchesAdminUserSearch,
    userMatchesPreset: adminUserMatchesPreset,
    usersFilterCounts,
    topActiveUsers,
    topActiveCustomers,
    now,
    ms7d: MS_7D,
    ms30d: MS_30D,
    toggleSelectUser,
    clearSelection,
  };
}

export type AdminUsersListState = ReturnType<typeof useAdminUsersListState>;
