import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerItem } from "../../../components/modals/CustomerPickModal";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { fetchAdminAuditLog } from "../../../api/client/admin/journal";
import { patchAdminUser } from "../../../api/client/admin/users";
import {
  buildEditorCustomersFromUser,
  buildEditorPermissionsFromUser,
  normalizeAdminUserRow,
} from "../lib/adminUsersHelpers";
import {
  PERMISSION_KEYS,
  applyPermissionsToggle,
  isPermissionLockedByRedReturns,
  isSuperadminOnlyPermissionKey,
  permissionsForAdminEditor,
} from "../lib/permissions";
import type { User } from "../types/adminUsers";

export type UseAdminUserEditorParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  fetchUsers: () => Promise<void>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCustomerDirectoryMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export function useAdminUserEditor({
  adminToken,
  isSuperAdmin,
  fetchUsers,
  setUsers,
  setCustomerDirectoryMap,
}: UseAdminUserEditorParams) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editorPermissions, setEditorPermissions] = useState<Record<string, boolean>>(() =>
    PERMISSION_KEYS.reduce((acc, perm) => ({ ...acc, [perm.key]: false }), {}),
  );
  const [editorFinancial, setEditorFinancial] = useState(true);
  const [editorAccessAllInns, setEditorAccessAllInns] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{
    password?: string;
    emailSent?: boolean;
    emailError?: string;
  } | null>(null);
  const [editorSendPasswordToEmail, setEditorSendPasswordToEmail] = useState(true);
  const [editorCustomers, setEditorCustomers] = useState<CustomerItem[]>([]);
  const [editorCustomerPickOpen, setEditorCustomerPickOpen] = useState(false);
  const [editorSelectedPresetId, setEditorSelectedPresetId] = useState<string>("");
  const [editorChangeLoginValue, setEditorChangeLoginValue] = useState("");
  const [editorChangeLoginOpen, setEditorChangeLoginOpen] = useState(false);
  const [editorChangeLoginLoading, setEditorChangeLoginLoading] = useState(false);
  const [deleteProfileConfirmOpen, setDeleteProfileConfirmOpen] = useState(false);
  const [deleteProfileLoading, setDeleteProfileLoading] = useState(false);
  const [userChangeEntries, setUserChangeEntries] = useState<
    { id: number; action: string; details: Record<string, unknown> | null; created_at: string }[]
  >([]);
  const [userChangeLoading, setUserChangeLoading] = useState(false);
  const [userChangeQuery, setUserChangeQuery] = useState("");

  const openPermissionsEditor = useCallback((user: User) => {
    const normalized = normalizeAdminUserRow(user);
    setSelectedUser(normalized);
    setEditorSelectedPresetId("");
    setEditorPermissions(buildEditorPermissionsFromUser(normalized));
    setEditorFinancial(Boolean(normalized.financial_access));
    setEditorAccessAllInns(Boolean(normalized.permissions?.service_mode ?? normalized.access_all_inns));
    setEditorCustomers(buildEditorCustomersFromUser(normalized));
    setEditorError(null);
  }, []);

  const closePermissionsEditor = useCallback(() => {
    setSelectedUser(null);
    setResetPasswordInfo(null);
    setEditorSelectedPresetId("");
    setEditorChangeLoginOpen(false);
    setDeleteProfileConfirmOpen(false);
    setEditorCustomers([]);
  }, []);

  const handlePermissionsToggle = useCallback(
    (key: string) => {
      if (!isSuperAdmin && isSuperadminOnlyPermissionKey(key)) return;
      if (isPermissionLockedByRedReturns(key, editorPermissions)) return;
      setEditorSelectedPresetId("");
      const enablingRedReturns = key === "red_returns" && !editorPermissions.red_returns;
      setEditorPermissions((prev) => applyPermissionsToggle(prev, key));
      if (enablingRedReturns) {
        setEditorFinancial(false);
        setEditorAccessAllInns(false);
      }
    },
    [editorPermissions, isSuperAdmin],
  );

  const handleSaveUserPermissions = useCallback(async () => {
    if (!selectedUser) return;
    if (!editorAccessAllInns && !editorPermissions.service_mode && (editorCustomers ?? []).length === 0) {
      setEditorError("Конфликт: нет заказчиков и выключен служебный режим. Назначьте заказчика или включите служебный режим.");
      return;
    }
    setEditorLoading(true);
    setEditorError(null);
    try {
      await patchAdminUser(adminToken, selectedUser.id, {
        permissions: permissionsForAdminEditor(isSuperAdmin, editorPermissions, selectedUser.permissions),
        financial_access: editorFinancial,
        access_all_inns: isSuperAdmin
          ? editorAccessAllInns
          : Boolean(selectedUser.permissions?.service_mode ?? selectedUser.access_all_inns),
        customers: (editorCustomers ?? []).map((c) => ({ inn: c.inn, name: c.customer_name })),
      });
      await fetchUsers();
      setSelectedUser(null);
    } catch (e: unknown) {
      setEditorError((e as Error)?.message || "Ошибка сохранения");
    } finally {
      setEditorLoading(false);
    }
  }, [
    selectedUser,
    editorAccessAllInns,
    editorPermissions,
    editorCustomers,
    adminToken,
    isSuperAdmin,
    editorFinancial,
    fetchUsers,
  ]);

  const handleResetPassword = useCallback(async () => {
    if (!selectedUser) return;
    setEditorError(null);
    setResetPasswordInfo(null);
    try {
      const data = await patchAdminUser(adminToken, selectedUser.id, {
        reset_password: true,
        send_password_to_email: editorSendPasswordToEmail,
      });
      setResetPasswordInfo({
        password: data.password,
        emailSent: data.emailSent,
        emailError: data.emailError,
      });
    } catch (e: unknown) {
      setEditorError((e as Error)?.message || "Ошибка сброса пароля");
    }
  }, [selectedUser, adminToken, editorSendPasswordToEmail]);

  const saveEditorLogin = useCallback(async () => {
    const newLogin = editorChangeLoginValue.trim().toLowerCase();
    if (!newLogin || !selectedUser) return;
    setEditorChangeLoginLoading(true);
    setEditorError(null);
    try {
      await patchAdminUser(adminToken, selectedUser.id, { login: newLogin });
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, login: newLogin } : u)));
      setEditorChangeLoginOpen(false);
      openPermissionsEditor({ ...selectedUser, login: newLogin });
    } catch (e: unknown) {
      setEditorError((e as Error)?.message ?? "Не удалось изменить логин");
    } finally {
      setEditorChangeLoginLoading(false);
    }
  }, [editorChangeLoginValue, selectedUser, adminToken, setUsers, openPermissionsEditor]);

  const archiveSelectedUser = useCallback(async () => {
    if (!selectedUser || deleteProfileLoading) return;
    setDeleteProfileLoading(true);
    try {
      await patchAdminUser(adminToken, selectedUser.id, { delete_profile: true });
      setDeleteProfileConfirmOpen(false);
      closePermissionsEditor();
      await fetchUsers();
    } catch (e: unknown) {
      setEditorError((e as Error)?.message ?? "Не удалось удалить");
    } finally {
      setDeleteProfileLoading(false);
    }
  }, [selectedUser, deleteProfileLoading, adminToken, closePermissionsEditor, fetchUsers]);

  useEffect(() => {
    if (!selectedUser) return;
    setEditorPermissions(buildEditorPermissionsFromUser(selectedUser));
    setEditorFinancial(Boolean(selectedUser.financial_access));
    setEditorAccessAllInns(Boolean(selectedUser.permissions?.service_mode ?? selectedUser.access_all_inns));
    setEditorCustomers(buildEditorCustomersFromUser(selectedUser));
    setEditorError(null);
    searchAdminCustomers(adminToken, { limit: 2000 })
      .then((customers) => {
        const map: Record<string, string> = {};
        for (const c of customers) {
          if (c.inn && c.customer_name) map[c.inn] = c.customer_name;
        }
        setCustomerDirectoryMap(map);
      })
      .catch(() => setCustomerDirectoryMap({}));
  }, [selectedUser, adminToken, setCustomerDirectoryMap]);

  useEffect(() => {
    if (!selectedUser) setResetPasswordInfo(null);
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) {
      setUserChangeEntries([]);
      setUserChangeQuery("");
      return;
    }
    const login = String(selectedUser.login || "").trim();
    setUserChangeQuery(login);
    setUserChangeLoading(true);
    fetchAdminAuditLog(adminToken, { q: login, limit: 30 })
      .then((entries) => setUserChangeEntries(Array.isArray(entries) ? entries : []))
      .catch(() => setUserChangeEntries([]))
      .finally(() => setUserChangeLoading(false));
  }, [selectedUser, adminToken]);

  const editorDiffItems = useMemo(() => {
    if (!selectedUser) return [] as string[];
    const items: string[] = [];
    const originalPermissions = selectedUser.permissions || {};
    const changedPerms: string[] = [];
    for (const p of PERMISSION_KEYS) {
      const before = !!originalPermissions[p.key];
      const after = !!editorPermissions[p.key];
      if (before !== after) changedPerms.push(`${p.label}: ${before ? "вкл" : "выкл"} -> ${after ? "вкл" : "выкл"}`);
    }
    if (changedPerms.length) items.push(`Права: ${changedPerms.join("; ")}`);
    if (Boolean(selectedUser.financial_access) !== Boolean(editorFinancial)) {
      items.push(`Фин. показатели: ${selectedUser.financial_access ? "вкл" : "выкл"} -> ${editorFinancial ? "вкл" : "выкл"}`);
    }
    const beforeService = Boolean(selectedUser.permissions?.service_mode ?? selectedUser.access_all_inns);
    const afterService = Boolean(editorPermissions.service_mode || editorAccessAllInns);
    if (beforeService !== afterService) {
      items.push(`Служебный режим: ${beforeService ? "вкл" : "выкл"} -> ${afterService ? "вкл" : "выкл"}`);
    }
    const originalCustomers = buildEditorCustomersFromUser(selectedUser)
      .map((c) => c.inn)
      .filter(Boolean)
      .sort();
    const editedCustomers = (editorCustomers ?? []).map((c) => c.inn).filter(Boolean).sort();
    if (JSON.stringify(originalCustomers) !== JSON.stringify(editedCustomers)) {
      items.push(
        `Заказчики: ${originalCustomers.length ? originalCustomers.join(", ") : "не назначены"} -> ${editedCustomers.length ? editedCustomers.join(", ") : "не назначены"}`,
      );
    }
    return items;
  }, [selectedUser, editorPermissions, editorFinancial, editorAccessAllInns, editorCustomers]);

  return {
    selectedUser,
    editorPermissions,
    setEditorPermissions,
    editorFinancial,
    setEditorFinancial,
    editorAccessAllInns,
    setEditorAccessAllInns,
    editorLoading,
    editorError,
    resetPasswordInfo,
    editorSendPasswordToEmail,
    setEditorSendPasswordToEmail,
    editorCustomers,
    setEditorCustomers,
    editorCustomerPickOpen,
    setEditorCustomerPickOpen,
    editorSelectedPresetId,
    setEditorSelectedPresetId,
    editorChangeLoginValue,
    setEditorChangeLoginValue,
    editorChangeLoginOpen,
    setEditorChangeLoginOpen,
    editorChangeLoginLoading,
    deleteProfileConfirmOpen,
    setDeleteProfileConfirmOpen,
    deleteProfileLoading,
    userChangeEntries,
    userChangeLoading,
    userChangeQuery,
    setUserChangeQuery,
    editorDiffItems,
    openPermissionsEditor,
    closePermissionsEditor,
    handlePermissionsToggle,
    handleSaveUserPermissions,
    handleResetPassword,
    saveEditorLogin,
    archiveSelectedUser,
  };
}

export type AdminUserEditorState = ReturnType<typeof useAdminUserEditor>;
