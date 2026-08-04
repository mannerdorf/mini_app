import { useAdminUsersData } from "./useAdminUsersData";
import { useAdminUsersListState } from "./useAdminUsersListState";
import type { PermissionPreset } from "../lib/permissions";

type UseAdminUsersOptions = {
  onLogout?: (reason?: "expired") => void;
  onError?: (msg: string | null) => void;
  enabled?: boolean;
};

export function useAdminUsers(
  adminToken: string,
  permissionPresets: PermissionPreset[],
  options: UseAdminUsersOptions = {},
) {
  const data = useAdminUsersData({ adminToken, ...options });
  const list = useAdminUsersListState({ users: data.users, permissionPresets });

  return {
    ...data,
    ...list,
  };
}

export type UseAdminUsersReturn = ReturnType<typeof useAdminUsers>;
