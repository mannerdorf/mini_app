import React, { useMemo, useRef } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { filterAndSortAdminUsers } from "../lib/adminUsersListPipeline";
import { AdminUsersLoginListView } from "./AdminUsersLoginListView";
import { AdminUsersCustomerGroupsView } from "./AdminUsersCustomerGroupsView";
import type { AdminUsersListPanelProps } from "./adminUsersListShared";

export function AdminUsersListPanel(props: AdminUsersListPanelProps) {
  const {
    loading,
    users,
    usersSearchQuery,
    usersViewMode,
    usersSortBy,
    usersSortOrder,
    usersFilterBy,
    usersFilterActive,
    usersFilterLastLogin,
    usersFilterPresetId,
    usersVisibleCount,
    permissionPresets,
    matchesUserSearch,
    userMatchesPreset,
    now,
    ms7d,
    ms30d,
    expandedCustomerLabels,
    setExpandedCustomerLabels,
    ...rest
  } = props;

  const bulkDeactivateModalRef = useRef<HTMLDivElement>(null);

  const listData = useMemo(
    () => filterAndSortAdminUsers({
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
    }),
    [
      users,
      usersSearchQuery,
      usersFilterBy,
      usersFilterActive,
      usersFilterLastLogin,
      usersFilterPresetId,
      usersSortBy,
      usersSortOrder,
      usersVisibleCount,
      now,
      ms7d,
      ms30d,
      permissionPresets,
      matchesUserSearch,
      userMatchesPreset,
    ],
  );

  if (loading) {
    return (
      <Flex align="center" gap="0.5rem">
        <Loader2 className="w-4 h-4 animate-spin" />
        <Typography.Body>Загрузка...</Typography.Body>
      </Flex>
    );
  }

  if (users.length === 0) {
    return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет зарегистрированных пользователей</Typography.Body>;
  }

  const shared = {
    ...rest,
    users,
    permissionPresets,
    sorted: listData.sorted,
    visibleSorted: listData.visibleSorted,
    hasMore: listData.hasMore,
    bulkDeactivateModalRef,
  };

  if (usersViewMode === "login") {
    return <AdminUsersLoginListView {...shared} />;
  }

  return (
    <AdminUsersCustomerGroupsView
      {...shared}
      usersSearchQuery={usersSearchQuery}
      expandedCustomerLabels={expandedCustomerLabels}
      setExpandedCustomerLabels={setExpandedCustomerLabels}
    />
  );
}
