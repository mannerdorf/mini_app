import { useCallback, useEffect, useRef, useState } from "react";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { fetchAdminUsers } from "../../../api/client/admin/users";
import type { User } from "../types/adminUsers";

type Params = {
  adminToken: string;
  enabled?: boolean;
  onLogout?: (reason?: "expired") => void;
  onError?: (msg: string | null) => void;
};

export function useAdminUsersData({
  adminToken,
  enabled = true,
  onLogout,
  onError,
}: Params) {
  const [users, setUsers] = useState<User[]>([]);
  const [lastLoginAvailable, setLastLoginAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [customerDirectoryMap, setCustomerDirectoryMap] = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const data = await fetchAdminUsers(adminToken);
      setUsers(data.users);
      setLastLoginAvailable(data.last_login_available);
    } catch (e: unknown) {
      if ((e as Error & { status?: number })?.status === 401) {
        onLogout?.("expired");
        return;
      }
      onError?.((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onLogout, onError]);

  const fetchUsersRef = useRef(fetchUsers);
  const fetchingTabRef = useRef(false);
  fetchUsersRef.current = fetchUsers;

  useEffect(() => {
    if (!enabled) return;
    if (fetchingTabRef.current) return;
    fetchingTabRef.current = true;
    fetchUsersRef.current()?.finally(() => {
      fetchingTabRef.current = false;
    });
  }, [enabled, adminToken]);

  useEffect(() => {
    if (!enabled) return;
    searchAdminCustomers(adminToken, { limit: 2000 })
      .then((customers) => {
        const map: Record<string, string> = {};
        for (const c of customers) {
          if (c.inn && c.customer_name) map[c.inn] = c.customer_name;
        }
        setCustomerDirectoryMap(map);
      })
      .catch(() => {});
  }, [enabled, adminToken]);

  return {
    users,
    setUsers,
    loading,
    fetchUsers,
    lastLoginAvailable,
    customerDirectoryMap,
    setCustomerDirectoryMap,
  };
}

export type AdminUsersDataState = ReturnType<typeof useAdminUsersData>;
