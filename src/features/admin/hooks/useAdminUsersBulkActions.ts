import { useCallback } from "react";
import { patchAdminUser } from "../../../api/client/admin/users";
import { permissionsForAdminEditor } from "../lib/permissions";
import type { User } from "../types/adminUsers";

type Params = {
  adminToken: string;
  isSuperAdmin: boolean;
  users: User[];
  selectedUserIds: number[];
  bulkPermissions: Record<string, boolean>;
  bulkFinancial: boolean;
  bulkAccessAllInns: boolean;
  fetchUsers: () => Promise<void>;
  setBulkLoading: (v: boolean) => void;
  setBulkError: (v: string | null) => void;
  setSelectedUserIds: (v: number[] | ((prev: number[]) => number[])) => void;
  setBulkSelectedPresetId: (v: string) => void;
  setBulkDeactivateConfirmOpen: (v: boolean) => void;
};

export function useAdminUsersBulkActions({
  adminToken,
  isSuperAdmin,
  users,
  selectedUserIds,
  bulkPermissions,
  bulkFinancial,
  bulkAccessAllInns,
  fetchUsers,
  setBulkLoading,
  setBulkError,
  setSelectedUserIds,
  setBulkSelectedPresetId,
  setBulkDeactivateConfirmOpen,
}: Params) {
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

  return { handleBulkApplyPermissions, handleBulkDeactivate };
}
