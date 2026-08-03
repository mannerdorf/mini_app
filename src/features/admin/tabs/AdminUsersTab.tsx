import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { TapSwitch } from "../../../components/TapSwitch";
import { CustomerPickModal, type CustomerItem } from "../../../components/modals/CustomerPickModal";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { fetchAdminAuditLog } from "../../../api/client/admin/journal";
import { registerAdminUser, patchAdminUser } from "../../../api/client/admin/users";
import {
  PERMISSION_KEYS,
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPermissionsToggle,
  applyPresetPermissionsWithSendingsGate,
  createDefaultPermissions,
  isDashboardPermissionDisabled,
  isPermissionLockedByRedReturns,
  isSuperadminOnlyPermissionKey,
  normalizeAnalyticsDashboardPermissions,
  permissionsForAdminEditor,
  superadminRowPermissionActiveClass,
  type PermissionPreset,
} from "../lib/permissions";
import { innMatchesSearchQuery, legalEntityNameMatchesQuery } from "../lib/userSearch";
import { isPasswordStrongEnough } from "../lib/password";
import type { UseAdminUsersReturn } from "../hooks/useAdminUsers";
import type { User } from "../types/adminUsers";

function AdminUserRow({
  user,
  adminToken,
  onToggleActive,
  onEditPermissions,
  rank,
}: {
  user: User;
  adminToken: string;
  onToggleActive: () => Promise<void>;
  onEditPermissions: (user: User) => void;
  rank?: number;
}) {
  const [loading, setLoading] = useState(false);
  const now = Date.now();
  const lastMs = user.last_login_at ? new Date(user.last_login_at).getTime() : 0;
  const diffMs = lastMs ? now - lastMs : Infinity;
  const ms30d = 30 * 24 * 3600 * 1000;
  const freshness = diffMs >= ms30d ? 0 : Math.max(0, 1 - diffMs / ms30d);
  const accentOpacity = Math.min(0.5, 0.12 + freshness * 0.38);
  const timeLabel = user.last_login_at
    ? (() => {
        const d = new Date(user.last_login_at as string);
        const dMs = now - d.getTime();
        const diffM = Math.floor(dMs / 60000);
        const diffH = Math.floor(dMs / 3600000);
        const diffD = Math.floor(dMs / 86400000);
        if (diffM < 1) return "только что";
        if (diffM < 60) return `${diffM} мин назад`;
        if (diffH < 24) return `${diffH} ч назад`;
        if (diffD < 7) return `${diffD} дн назад`;
        return formatDisplayDateFromDate(d);
      })()
    : "никогда";
  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggleActive();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEditPermissions(user)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditPermissions(user); } }}
      style={{
        padding: "0.65rem 0.75rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: user.active ? "var(--color-bg-hover)" : "var(--color-bg-input)",
        borderLeft: `4px solid rgba(0, 113, 227, ${accentOpacity})`,
        opacity: user.active ? 1 : 0.85,
        cursor: "pointer",
      }}
    >
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="0.5rem">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Body style={{ fontWeight: 600, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
            {typeof rank === "number" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {rank + 1}
              </span>
            )}
            {user.login ?? "—"}
          </Typography.Body>
          <Flex gap="0.35rem" align="center" wrap="wrap" style={{ marginTop: "0.35rem" }}>
            <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
              {user.active ? "Активен" : "Неактивен"}
            </Typography.Body>
            {user.created_at && (
              <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", padding: "0.1rem 0.45rem", borderRadius: 999, background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                Создан: {formatDisplayDate(user.created_at)}
              </Typography.Body>
            )}
          </Flex>
        </div>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Typography.Body
            style={{
              fontSize: "0.74rem",
              color: "var(--color-text-secondary)",
              padding: "0.15rem 0.45rem",
              borderRadius: 999,
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            {timeLabel}
          </Typography.Body>
          <span style={{ cursor: loading ? "wait" : "pointer" }}>
            <TapSwitch checked={user.active} onToggle={handleToggle} />
          </span>
        </Flex>
      </Flex>
    </div>
  );
}

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
  USERS_PAGE_SIZE,
  users,
  setUsers,
  loading,
  fetchUsers,
  lastLoginAvailable,
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
  customerDirectoryMap,
  setCustomerDirectoryMap,
  matchesUserSearch,
  userMatchesPreset,
  usersFilterCounts,
  topActiveUsers,
  topActiveCustomers,
  now,
  ms7d,
  ms30d,
  toggleSelectUser,
  clearSelection,
}: AdminUsersTabProps) {
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const deactivateModalRef = useRef<HTMLDivElement>(null);
  const bulkDeactivateModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(deactivateModalRef, deactivateConfirmUserId != null, () => setDeactivateConfirmUserId(null));
  useFocusTrap(bulkDeactivateModalRef, bulkDeactivateConfirmOpen, () => !bulkLoading && setBulkDeactivateConfirmOpen(false));

  const [formAccessAllInns, setFormAccessAllInns] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerItem[]>([]);
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>(() =>
    createDefaultPermissions({ supervisor: true })
  );
  const [formSelectedPresetId, setFormSelectedPresetId] = useState<string>("");
  const [formFinancial, setFormFinancial] = useState(true);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);
  const [customerPickModalOpen, setCustomerPickModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editorPermissions, setEditorPermissions] = useState<Record<string, boolean>>(() =>
    PERMISSION_KEYS.reduce((acc, perm) => ({ ...acc, [perm.key]: false }), {})
  );
  const [editorFinancial, setEditorFinancial] = useState(true);
  const [editorAccessAllInns, setEditorAccessAllInns] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ password?: string; emailSent?: boolean; emailError?: string } | null>(null);
  const [editorSendPasswordToEmail, setEditorSendPasswordToEmail] = useState(true);
  const [editorCustomers, setEditorCustomers] = useState<CustomerItem[]>([]);
  const [editorCustomerPickOpen, setEditorCustomerPickOpen] = useState(false);
  const [editorSelectedPresetId, setEditorSelectedPresetId] = useState<string>("");
  const [editorChangeLoginValue, setEditorChangeLoginValue] = useState("");
  const [editorChangeLoginOpen, setEditorChangeLoginOpen] = useState(false);
  const [editorChangeLoginLoading, setEditorChangeLoginLoading] = useState(false);
  const [deleteProfileConfirmOpen, setDeleteProfileConfirmOpen] = useState(false);
  const [deleteProfileLoading, setDeleteProfileLoading] = useState(false);
  const [userChangeEntries, setUserChangeEntries] = useState<{ id: number; action: string; details: Record<string, unknown> | null; created_at: string }[]>([]);
  const [userChangeLoading, setUserChangeLoading] = useState(false);
  const [userChangeQuery, setUserChangeQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormResult(null);
    onError(null);
    const normalizedEmail = formEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      onError("Введите корректный email");
      setFormSubmitting(false);
      return;
    }
    if (users.some((u) => String(u.login || "").trim().toLowerCase() === normalizedEmail)) {
      onError("Пользователь с таким email уже существует");
      setFormSubmitting(false);
      return;
    }
    if (!formAccessAllInns && !formPermissions.service_mode && selectedCustomers.length === 0) {
      onError("Выберите заказчика из справочника или включите служебный режим");
      setFormSubmitting(false);
      return;
    }
    if (!formSendEmail && !formPassword) {
      onError("Введите пароль вручную или включите отправку на email");
      setFormSubmitting(false);
      return;
    }
    if (!formSendEmail) {
      const strong = isPasswordStrongEnough(formPassword);
      if (!strong.ok) {
        onError(strong.message || "Пароль слишком простой. Минимум 8 символов, буквы и цифры.");
        setFormSubmitting(false);
        return;
      }
    }

    const entry = {
      login: normalizedEmail,
      password: formPassword,
      customer: selectedCustomers[0]?.customer_name,
    };
    if (!entry.login) {
      onError("Введите email");
      setFormSubmitting(false);
      return;
    }
    try {
      await registerEntry(entry);
      const baseResult = formSendEmail ? { emailSent: true } : { password: formPassword, emailSent: false };
      setFormResult(baseResult);
      setSelectedCustomers([]);
      setFormEmail("");
      setFormPassword("");
      setCustomerPickModalOpen(false);
      fetchUsers();
      setShowAddUserForm(false);
    } catch (e: unknown) {
      onError((e as Error).message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const openAddUserForm = useCallback(() => {
    const raw = usersSearchQuery.trim();
    const emailCandidate = raw.toLowerCase();
    const hasMatches = users.some((u) => matchesUserSearch(u, raw));
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate);
    if (raw && !hasMatches && isEmail) {
      setFormEmail(emailCandidate);
    }
    setShowAddUserForm(true);
  }, [usersSearchQuery, users, matchesUserSearch]);

  const togglePerm = (key: string) => {
    if (!isSuperAdmin && isSuperadminOnlyPermissionKey(key)) return;
    setFormSelectedPresetId("");
    setFormPermissions((p) => applyPermissionsToggle(p, key));
  };

  const fetchCustomersForModal = useCallback(
    async (query: string): Promise<CustomerItem[]> => {
      const customers = await searchAdminCustomers(adminToken, { q: query, limit: 200 });
      return customers.map((c) => ({
        inn: c.inn,
        customer_name: c.customer_name,
        email: c.email || "",
      }));
    },
    [adminToken]
  );

  const clearCustomerSelection = () => setSelectedCustomers([]);

  const addSelectedCustomer = (customer: CustomerItem) => {
    setSelectedCustomers((prev) => {
      if (prev.find((c) => c.inn === customer.inn)) return prev;
      return [...prev, customer];
    });
  };

  const removeSelectedCustomer = (inn: string) => {
    setSelectedCustomers((prev) => prev.filter((c) => c.inn !== inn));
  };

  const registerEntry = async (entry: { login: string; password: string; inn?: string; customer?: string }) => {
    const payload: Record<string, unknown> = {
      login: entry.login.trim(),
      email: entry.login.trim(),
      password: formSendEmail ? undefined : entry.password || formPassword,
      send_email: formSendEmail,
      permissions: permissionsForAdminEditor(isSuperAdmin, formPermissions, {}),
      financial_access: formFinancial,
      access_all_inns: formAccessAllInns,
    };
    if (selectedCustomers.length > 0) {
      payload.customers = selectedCustomers.map((c) => ({
        inn: c.inn,
        name: c.customer_name,
      }));
    } else if (entry.inn) {
      payload.customers = [{ inn: entry.inn, name: entry.customer || entry.inn }];
    } else if (entry.customer) {
      payload.customers = [{ name: entry.customer, inn: "" }];
    }
    return registerAdminUser(adminToken, payload);
  };

  const formEmailError = useMemo(() => {
    const value = formEmail.trim();
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "Некорректный формат email";
    const duplicate = users.some((u) => String(u.login || "").trim().toLowerCase() === normalized);
    if (duplicate) return "Пользователь с таким email уже существует";
    return null;
  }, [formEmail, users]);

  const openPermissionsEditor = (user: User) => {
    setSelectedUser(user);
    setEditorSelectedPresetId("");
  };

  const closePermissionsEditor = () => {
    setSelectedUser(null);
    setResetPasswordInfo(null);
    setEditorSelectedPresetId("");
    setEditorChangeLoginOpen(false);
    setDeleteProfileConfirmOpen(false);
  };

  const handlePermissionsToggle = (key: string) => {
    if (!isSuperAdmin && isSuperadminOnlyPermissionKey(key)) return;
    if (isPermissionLockedByRedReturns(key, editorPermissions)) return;
    setEditorSelectedPresetId("");
    const enablingRedReturns = key === "red_returns" && !editorPermissions.red_returns;
    setEditorPermissions((prev) => applyPermissionsToggle(prev, key));
    if (enablingRedReturns) {
      setEditorFinancial(false);
      setEditorAccessAllInns(false);
    }
  };

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

  const handleSaveUserPermissions = async () => {
    if (!selectedUser) return;
    if (!editorAccessAllInns && !editorPermissions.service_mode && editorCustomers.length === 0) {
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
        customers: editorCustomers.map((c) => ({ inn: c.inn, name: c.customer_name })),
      });
      await fetchUsers();
      setSelectedUser(null);
    } catch (e: unknown) {
      setEditorError((e as Error)?.message || "Ошибка сохранения");
    } finally {
      setEditorLoading(false);
    }
  };

  const handleResetPassword = async () => {
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
  };

  useEffect(() => {
    if (!selectedUser) return;
    const nextPermissions = normalizeAnalyticsDashboardPermissions(
      PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, perm) => {
        acc[perm.key] = Boolean(selectedUser.permissions?.[perm.key]);
        return acc;
      }, {})
    );
    setEditorPermissions(nextPermissions);
    setEditorFinancial(Boolean(selectedUser.financial_access));
    setEditorAccessAllInns(Boolean(selectedUser.permissions?.service_mode ?? selectedUser.access_all_inns));
    const list = selectedUser.companies?.length
      ? selectedUser.companies.map((c) => ({ inn: c.inn, customer_name: c.name || "", email: "" }))
      : selectedUser.inn
        ? [{ inn: selectedUser.inn, customer_name: selectedUser.company_name || "", email: "" }]
        : [];
    setEditorCustomers(list);
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
      .then(setUserChangeEntries)
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
    const originalCustomers = (selectedUser.companies?.length
      ? selectedUser.companies.map((c) => c.inn)
      : selectedUser.inn
        ? [selectedUser.inn]
        : []).filter(Boolean).sort();
    const editedCustomers = editorCustomers.map((c) => c.inn).filter(Boolean).sort();
    if (JSON.stringify(originalCustomers) !== JSON.stringify(editedCustomers)) {
      items.push(
        `Заказчики: ${originalCustomers.length ? originalCustomers.join(", ") : "не назначены"} -> ${editedCustomers.length ? editedCustomers.join(", ") : "не назначены"}`
      );
    }
    return items;
  }, [selectedUser, editorPermissions, editorFinancial, editorAccessAllInns, editorCustomers]);

  return (
    <>
        <>
          {deactivateConfirmUserId != null && (() => {
            const u = users.find((x) => x.id === deactivateConfirmUserId);
            return u ? (
              <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setDeactivateConfirmUserId(null)} role="dialog" aria-modal="true" aria-labelledby="deactivate-user-title">
                <div ref={deactivateModalRef} onClick={(e) => e.stopPropagation()}>
                <Panel className="cargo-card" style={{ maxWidth: "24rem", margin: "2rem auto", padding: "var(--pad-card, 1rem)" }}>
                  <Typography.Body id="deactivate-user-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Деактивировать пользователя?</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                    {u.login} не сможет войти в приложение.
                  </Typography.Body>
                  <Flex gap="0.5rem">
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "var(--color-error, #dc2626)", color: "white" }}
                      aria-label="Деактивировать пользователя"
                      onClick={async () => {
                        try {
                          await patchAdminUser(adminToken, u.id, { active: false });
                          setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: false } : x)));
                        } catch (e: unknown) {
                          onError((e as Error)?.message || "Ошибка обновления");
                        }
                        setDeactivateConfirmUserId(null);
                      }}
                    >
                      Деактивировать
                    </Button>
                    <Button type="button" className="filter-button" onClick={() => setDeactivateConfirmUserId(null)} aria-label="Отмена">
                      Отмена
                    </Button>
                  </Flex>
                </Panel>
                </div>
              </div>
            ) : null;
          })()}
          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
            <button
              type="button"
              onClick={() => setTopActiveExpanded((e) => !e)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginBottom: topActiveExpanded ? "0.5rem" : 0,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
              }}
              aria-expanded={topActiveExpanded}
              aria-label={topActiveExpanded ? "Свернуть топ активных пользователей" : "Развернуть топ активных пользователей"}
            >
              {topActiveExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Activity className="w-4 h-4" />
              <Typography.Body style={{ fontWeight: 600 }}>Топ активных пользователей</Typography.Body>
            </button>
            {topActiveExpanded && (
              <>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                  По последнему входу в приложение
                </Typography.Body>
                <Flex align="center" gap="0.35rem" style={{ marginBottom: "0.5rem" }}>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "users" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "users" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("users")}
                  >
                    Пользователи
                  </Button>
                  <Button
                    type="button"
                    className="filter-button"
                    style={{
                      padding: "0 0.6rem",
                      fontSize: "0.85rem",
                      background: topActiveMode === "customers" ? "var(--color-primary-blue)" : undefined,
                      color: topActiveMode === "customers" ? "white" : undefined,
                    }}
                    onClick={() => setTopActiveMode("customers")}
                  >
                    Заказчики
                  </Button>
                </Flex>
                {!lastLoginAvailable && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
                    Колонка last_login_at отсутствует в БД. Выполните миграцию 015 (migrations/015_registered_users_last_login.sql) — тогда время входа будет сохраняться при входе по email/пароль.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "users" && topActiveUsers.length > 0 && topActiveUsers.every((u) => !u.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveMode === "customers" && topActiveCustomers.length > 0 && topActiveCustomers.every((c) => !c.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи компаний войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {loading ? (
                  <Flex align="center" gap="0.5rem">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
                  </Flex>
                ) : (topActiveMode === "users" ? topActiveUsers.length === 0 : topActiveCustomers.length === 0) ? (
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                    {topActiveMode === "users"
                      ? "Нет активных пользователей. Данные о входах появятся после входа через CMS."
                      : "Нет активных заказчиков. Данные о входах появятся после входа через CMS."}
                  </Typography.Body>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(topActiveMode === "users" ? topActiveUsers : topActiveCustomers).map((u, i) => {
                      const now = Date.now();
                      const lastMs = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
                      const diffMs = lastMs ? now - lastMs : Infinity;
                      const ms30d = 30 * 24 * 3600 * 1000;
                      const freshness = diffMs >= ms30d ? 0 : Math.max(0, 1 - diffMs / ms30d);
                      const accentOpacity = Math.min(0.5, 0.12 + freshness * 0.38);
                      const timeLabel = u.last_login_at
                        ? (() => {
                            const d = new Date(u.last_login_at);
                            const nowDate = new Date();
                            const dMs = nowDate.getTime() - d.getTime();
                            const diffM = Math.floor(dMs / 60000);
                            const diffH = Math.floor(dMs / 3600000);
                            const diffD = Math.floor(dMs / 86400000);
                            if (diffM < 1) return "только что";
                            if (diffM < 60) return `${diffM} мин назад`;
                            if (diffH < 24) return `${diffH} ч назад`;
                            if (diffD < 7) return `${diffD} дн назад`;
                            return formatDisplayDateFromDate(d);
                          })()
                        : "никогда";
                      return (
                      <div
                        key={"id" in u ? u.id : `customer-${u.customer}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.55rem 0.65rem",
                          background: "var(--color-bg-hover)",
                          border: "1px solid var(--color-border)",
                          borderLeft: `4px solid rgba(0, 113, 227, ${accentOpacity})`,
                          borderRadius: 8,
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--color-text-primary)" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 22,
                              height: 22,
                              marginRight: 8,
                              borderRadius: 999,
                              fontSize: "0.75rem",
                              background: "var(--color-bg-card)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {i + 1}
                          </span>
                          {"login" in u ? u.login : u.customer}
                          {"users_count" in u ? ` (${u.users_count})` : ""}
                        </span>
                        <Typography.Body
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--color-text-secondary)",
                            marginLeft: "0.5rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: 999,
                            background: "var(--color-bg-card)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          {timeLabel}
                        </Typography.Body>
                      </div>
                    ); })}
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
            <Flex className="admin-users-toolbar" gap="0.75rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
              <Button
                type="button"
                className="filter-button"
                style={{ background: "var(--color-primary-blue)", color: "white", padding: "0.4rem 0.75rem", fontSize: "0.9rem" }}
                onClick={openAddUserForm}
                aria-label="Добавить пользователя — открыть форму регистрации"
              >
                <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Добавить пользователя
              </Button>
              <Flex align="center" gap="0.35rem">
                <Button
                  className="filter-button"
                  style={{ padding: "0 0.6rem", fontSize: "0.85rem", background: usersViewMode === "login" ? "var(--color-primary-blue)" : undefined, color: usersViewMode === "login" ? "white" : undefined }}
                  onClick={() => setUsersViewMode("login")}
                >
                  По логинам
                </Button>
                <Button
                  className="filter-button"
                  style={{ padding: "0 0.6rem", fontSize: "0.85rem", background: usersViewMode === "customer" ? "var(--color-primary-blue)" : undefined, color: usersViewMode === "customer" ? "white" : undefined }}
                  onClick={() => setUsersViewMode("customer")}
                >
                  По заказчикам
                </Button>
              </Flex>
              <label htmlFor="admin-users-search" className="visually-hidden">Поиск пользователей</label>
              <Input
                id="admin-users-search"
                type="text"
                placeholder="Логин, ИНН, наименование организации…"
                value={usersSearchQuery}
                onChange={(e) => setUsersSearchQuery(e.target.value)}
                className="admin-form-input"
                style={{ maxWidth: "24rem" }}
                aria-label="Поиск: логин, ИНН, наименование юрлица"
              />
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-by" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Права:</label>
                <select
                  id="users-filter-by"
                  value={usersFilterBy}
                  onChange={(e) => setUsersFilterBy(e.target.value as typeof usersFilterBy)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "11rem" }}
                  aria-label="Фильтр по правам доступа"
                >
                  <option value="all">Все ({usersFilterCounts.all})</option>
                  <option value="cms">С доступом в CMS ({usersFilterCounts.cms})</option>
                  <option value="no_cms">Без доступа в CMS ({usersFilterCounts.no_cms})</option>
                  <option value="service_mode">Со служебным режимом ({usersFilterCounts.service_mode})</option>
                  <option value="supervisor">Руководитель — с правом ({usersFilterCounts.supervisor})</option>
                  <option value="no_supervisor">Руководитель — без права ({usersFilterCounts.no_supervisor})</option>
                  <option value="analytics">Аналитика — с правом ({usersFilterCounts.analytics})</option>
                  <option value="no_analytics">Аналитика — без права ({usersFilterCounts.no_analytics})</option>
                  <option value="home">Главная — с правом ({usersFilterCounts.home})</option>
                  <option value="no_home">Без главной ({usersFilterCounts.no_home})</option>
                  <option value="dashboard">Дашборд — с правом ({usersFilterCounts.dashboard})</option>
                  <option value="no_dashboard">Без дашборда ({usersFilterCounts.no_dashboard})</option>
                  <option value="sendings">Отправки — с правом ({usersFilterCounts.sendings})</option>
                  <option value="no_sendings">Отправки — без права ({usersFilterCounts.no_sendings})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-active" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Активность:</label>
                <select
                  id="users-filter-active"
                  value={usersFilterActive}
                  onChange={(e) => setUsersFilterActive(e.target.value as "all" | "active" | "inactive")}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по активности"
                >
                  <option value="all">Все</option>
                  <option value="active">Активные ({usersFilterCounts.active})</option>
                  <option value="inactive">Неактивные ({usersFilterCounts.inactive})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-last-login" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Вход:</label>
                <select
                  id="users-filter-last-login"
                  value={usersFilterLastLogin}
                  onChange={(e) => setUsersFilterLastLogin(e.target.value as typeof usersFilterLastLogin)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по последнему входу"
                >
                  <option value="all">Все</option>
                  <option value="7d">Входили за 7 дней ({usersFilterCounts.last_login_7d})</option>
                  <option value="30d">Входили за 30 дней ({usersFilterCounts.last_login_30d})</option>
                  <option value="old">Давно не входили ({usersFilterCounts.last_login_old})</option>
                  <option value="never">Никогда не входили ({usersFilterCounts.last_login_never})</option>
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-filter-preset" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Пресет:</label>
                <select
                  id="users-filter-preset"
                  value={usersFilterPresetId}
                  onChange={(e) => setUsersFilterPresetId(e.target.value)}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Фильтр по пресету прав"
                >
                  <option value="">Все</option>
                  {permissionPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({usersFilterCounts.preset(p.id)})</option>
                  ))}
                </select>
              </Flex>
              <Flex align="center" gap="var(--space-2, 0.35rem)">
                <label htmlFor="users-sort" style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Сортировка:</label>
                <select
                  id="users-sort"
                  value={`${usersSortBy}-${usersSortOrder}`}
                  onChange={(e) => {
                    const [by, order] = (e.target.value as string).split("-") as [typeof usersSortBy, typeof usersSortOrder];
                    setUsersSortBy(by);
                    setUsersSortOrder(order);
                  }}
                  className="admin-form-input"
                  style={{ padding: "0 0.5rem", fontSize: "0.85rem", minWidth: "10rem" }}
                  aria-label="Сортировка списка пользователей"
                >
                  <option value="email-asc">По email (А–Я)</option>
                  <option value="email-desc">По email (Я–А)</option>
                  <option value="date-desc">По дате (новые)</option>
                  <option value="date-asc">По дате (старые)</option>
                  <option value="active-desc">Сначала активные</option>
                  <option value="active-asc">Сначала неактивные</option>
                </select>
              </Flex>
              {isSuperAdmin && (
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => {
                    const q = usersSearchQuery.trim();
                    let list = users.filter((u) => matchesUserSearch(u, q));
                    if (usersFilterBy === "cms") list = list.filter((u) => !!u.permissions?.cms_access);
                    else if (usersFilterBy === "no_cms") list = list.filter((u) => !u.permissions?.cms_access);
                    else if (usersFilterBy === "service_mode") list = list.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns);
                    else if (usersFilterBy === "supervisor") list = list.filter((u) => !!u.permissions?.supervisor);
                    else if (usersFilterBy === "no_supervisor") list = list.filter((u) => !u.permissions?.supervisor);
                    else if (usersFilterBy === "analytics") list = list.filter((u) => !!u.permissions?.analytics);
                    else if (usersFilterBy === "no_analytics") list = list.filter((u) => !u.permissions?.analytics);
                    else if (usersFilterBy === "home") list = list.filter((u) => !!u.permissions?.home);
                    else if (usersFilterBy === "no_home") list = list.filter((u) => !u.permissions?.home);
                    else if (usersFilterBy === "dashboard") list = list.filter((u) => !!u.permissions?.dashboard);
                    else if (usersFilterBy === "no_dashboard") list = list.filter((u) => !u.permissions?.dashboard);
                    else if (usersFilterBy === "sendings") list = list.filter((u) => !!u.permissions?.doc_sendings);
                    else if (usersFilterBy === "no_sendings") list = list.filter((u) => !u.permissions?.doc_sendings);
                    if (usersFilterActive === "active") list = list.filter((u) => !!u.active);
                    else if (usersFilterActive === "inactive") list = list.filter((u) => !u.active);
                    if (usersFilterLastLogin === "7d") list = list.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms7d);
                    else if (usersFilterLastLogin === "30d") list = list.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms30d);
                    else if (usersFilterLastLogin === "never") list = list.filter((u) => u.last_login_at == null);
                    else if (usersFilterLastLogin === "old") list = list.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > ms30d);
                    if (usersFilterPresetId) {
                      const preset = permissionPresets.find((p) => p.id === usersFilterPresetId);
                      if (preset) list = list.filter((u) => userMatchesPreset(u, preset));
                    }
                    const rows = list.map((u) => {
                      const customers = u.companies?.length ? u.companies.map((c) => `${c.name || ""} (${c.inn})`).join("; ") : (u.inn ? `${u.company_name || ""} (${u.inn})` : "");
                      const perms = u.permissions && typeof u.permissions === "object" ? Object.entries(u.permissions).filter(([, v]) => v).map(([k]) => k).join("; ") : "";
                      return [u.login, customers, perms, u.active ? "да" : "нет", u.created_at ? formatDisplayDate(u.created_at) : ""];
                    });
                    const header = ["Логин", "Заказчики", "Права", "Активен", "Дата регистрации"];
                    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `пользователи_${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  Выгрузить в CSV
                </Button>
              )}
            </Flex>
            {loading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка...</Typography.Body>
              </Flex>
            ) : users.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет зарегистрированных пользователей</Typography.Body>
            ) : (() => {
              const q = usersSearchQuery.trim();
              let filtered = users.filter((u) => matchesUserSearch(u, q));
              if (usersFilterBy === "cms") filtered = filtered.filter((u) => !!u.permissions?.cms_access);
              else if (usersFilterBy === "no_cms") filtered = filtered.filter((u) => !u.permissions?.cms_access);
              else if (usersFilterBy === "service_mode") filtered = filtered.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns);
              else if (usersFilterBy === "supervisor") filtered = filtered.filter((u) => !!u.permissions?.supervisor);
              else if (usersFilterBy === "no_supervisor") filtered = filtered.filter((u) => !u.permissions?.supervisor);
              else if (usersFilterBy === "analytics") filtered = filtered.filter((u) => !!u.permissions?.analytics);
              else if (usersFilterBy === "no_analytics") filtered = filtered.filter((u) => !u.permissions?.analytics);
              else if (usersFilterBy === "home") filtered = filtered.filter((u) => !!u.permissions?.home);
              else if (usersFilterBy === "no_home") filtered = filtered.filter((u) => !u.permissions?.home);
              else if (usersFilterBy === "dashboard") filtered = filtered.filter((u) => !!u.permissions?.dashboard);
              else if (usersFilterBy === "no_dashboard") filtered = filtered.filter((u) => !u.permissions?.dashboard);
              else if (usersFilterBy === "sendings") filtered = filtered.filter((u) => !!u.permissions?.doc_sendings);
              else if (usersFilterBy === "no_sendings") filtered = filtered.filter((u) => !u.permissions?.doc_sendings);
              if (usersFilterActive === "active") filtered = filtered.filter((u) => !!u.active);
              else if (usersFilterActive === "inactive") filtered = filtered.filter((u) => !u.active);
              if (usersFilterLastLogin === "7d") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms7d);
              else if (usersFilterLastLogin === "30d") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms30d);
              else if (usersFilterLastLogin === "never") filtered = filtered.filter((u) => u.last_login_at == null);
              else if (usersFilterLastLogin === "old") filtered = filtered.filter((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > ms30d);
              if (usersFilterPresetId) {
                const preset = permissionPresets.find((p) => p.id === usersFilterPresetId);
                if (preset) filtered = filtered.filter((u) => userMatchesPreset(u, preset));
              }
              const sorted = [...filtered].sort((a, b) => {
                let cmp = 0;
                if (usersSortBy === "email") cmp = (a.login || "").localeCompare(b.login || "", "ru");
                else if (usersSortBy === "date") cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                else cmp = (a.active ? 1 : 0) - (b.active ? 1 : 0);
                return usersSortOrder === "desc" ? -cmp : cmp;
              });
              const visibleSorted = sorted.slice(0, usersVisibleCount);
              const hasMore = sorted.length > usersVisibleCount;
              const togglePermissionsEditor = (u: User) => {
                if (selectedUser?.id === u.id) closePermissionsEditor();
                else openPermissionsEditor(u);
              };
              const permissionsEditorPanel = selectedUser ? (
                <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: "var(--space-2, 0.5rem)" }}>
                  <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem", gap: "0.5rem" }}>
                    <Typography.Body style={{ fontWeight: 600 }}>{selectedUser.login ?? "—"}</Typography.Body>
                    <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={closePermissionsEditor}>
                      Закрыть
                    </Button>
                  </Flex>
                  <Flex align="center" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      id="editorSendPasswordToEmail"
                      checked={editorSendPasswordToEmail}
                      onChange={(e) => setEditorSendPasswordToEmail(e.target.checked)}
                    />
                    <label htmlFor="editorSendPasswordToEmail" style={{ fontSize: "0.9rem" }}>Новый пароль отправить на почту</label>
                  </Flex>
                  <Flex gap="0.5rem" align="center" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={handleResetPassword}>
                      Сбросить пароль
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ padding: "0.25rem 0.75rem" }}
                      onClick={() => {
                        setEditorChangeLoginOpen(true);
                        setEditorChangeLoginValue(selectedUser?.login ?? "");
                      }}
                    >
                      Изменить логин
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        type="button"
                        className="filter-button"
                        style={{ padding: "0.25rem 0.75rem", color: "var(--color-error)" }}
                        onClick={() => setDeleteProfileConfirmOpen(true)}
                      >
                        В архив
                      </Button>
                    )}
                  </Flex>
                  {editorChangeLoginOpen && (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label htmlFor="editor-new-login" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>Новый логин (email)</label>
                      <Flex gap="0.5rem" align="center" wrap="wrap">
                        <Input
                          id="editor-new-login"
                          className="admin-form-input"
                          type="email"
                          value={editorChangeLoginValue}
                          onChange={(e) => setEditorChangeLoginValue(e.target.value)}
                          placeholder="email@example.com"
                          style={{ flex: 1, minWidth: "12rem" }}
                        />
                        <Button
                          type="button"
                          className="filter-button"
                          disabled={editorChangeLoginLoading || !editorChangeLoginValue.trim()}
                          onClick={async () => {
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
                          }}
                        >
                          {editorChangeLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить логин"}
                        </Button>
                        <Button type="button" className="filter-button" onClick={() => setEditorChangeLoginOpen(false)}>
                          Отмена
                        </Button>
                      </Flex>
                    </div>
                  )}
                  {deleteProfileConfirmOpen && selectedUser && (
                    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !deleteProfileLoading && setDeleteProfileConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="delete-profile-title">
                      <div className="modal-content" style={{ maxWidth: "22rem", padding: "1.25rem" }} onClick={(e) => e.stopPropagation()}>
                        <Typography.Body id="delete-profile-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Архивировать профиль?</Typography.Body>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                          Пользователь {selectedUser.login} будет деактивирован и перемещён в архив. Профиль можно восстановить повторной активацией.
                        </Typography.Body>
                        <Flex gap="0.5rem" wrap="wrap">
                          <Button
                            type="button"
                            className="filter-button"
                            disabled={deleteProfileLoading}
                            style={{ color: "var(--color-error)" }}
                            onClick={async () => {
                              if (!selectedUser || deleteProfileLoading) return;
                              setDeleteProfileLoading(true);
                              try {
                                await patchAdminUser(adminToken, selectedUser.id, { delete_profile: true });
                                setDeleteProfileConfirmOpen(false);
                                closePermissionsEditor();
                                fetchUsers();
                              } catch (e: unknown) {
                                setEditorError((e as Error)?.message ?? "Не удалось удалить");
                              } finally {
                                setDeleteProfileLoading(false);
                              }
                            }}
                          >
                            {deleteProfileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Архивировать"}
                          </Button>
                          <Button type="button" className="filter-button" disabled={deleteProfileLoading} onClick={() => setDeleteProfileConfirmOpen(false)}>
                            Отмена
                          </Button>
                        </Flex>
                      </div>
                    </div>
                  )}
                  {resetPasswordInfo && (
                    <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {resetPasswordInfo.emailSent ? (
                        "Пароль отправлен на email."
                      ) : resetPasswordInfo.password ? (
                        <>
                          Новый временный пароль: <strong style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{resetPasswordInfo.password}</strong> Передайте его пользователю.
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(resetPasswordInfo.password || "")}
                            className="filter-button"
                            style={{ padding: "0.25rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            title="Копировать пароль"
                            aria-label="Копировать пароль"
                          >
                            <Copy size={16} />
                            Копировать
                          </button>
                        </>
                      ) : (
                        "Пароль не отправлен."
                      )}
                      {resetPasswordInfo.emailError && ` Ошибка отправки: ${resetPasswordInfo.emailError}`}
                    </div>
                  )}
                  <div className="admin-form-section" style={{ marginBottom: "0.5rem" }}>
                    <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
                      <Typography.Body style={{ fontSize: "0.85rem" }}>Пресет:</Typography.Body>
                      <select
                        className="admin-form-input"
                        style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        value={editorSelectedPresetId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setEditorSelectedPresetId(id);
                          const preset = permissionPresets.find((p) => p.id === id);
                          if (preset) {
                            const applied = applyPresetPermissionsWithSendingsGate(
                              preset.permissions,
                              isSuperAdmin,
                              selectedUser?.permissions?.doc_sendings === true
                            );
                            setEditorPermissions(
                              isSuperAdmin
                                ? applied
                                : permissionsForAdminEditor(false, applied, selectedUser?.permissions)
                            );
                            setEditorFinancial(preset.financial);
                            setEditorAccessAllInns(
                              isSuperAdmin
                                ? preset.serviceMode
                                : Boolean(selectedUser?.permissions?.service_mode ?? selectedUser?.access_all_inns)
                            );
                          }
                        }}
                      >
                        <option value="">—</option>
                        {permissionPresets.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </Flex>
                    <div className="admin-form-section-header">Разделы</div>
                    {isSuperAdmin && (
                      <div className="admin-permissions-toolbar">
                        {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
                          const isActive = key === "service_mode" ? (!!editorPermissions.service_mode || editorAccessAllInns) : !!editorPermissions[key];
                          const locked = isPermissionLockedByRedReturns(key, editorPermissions);
                          const onClick = () => {
                            if (locked) return;
                            setEditorSelectedPresetId("");
                            if (key === "service_mode") {
                              const v = !(!!editorPermissions.service_mode || editorAccessAllInns);
                              setEditorPermissions((p) => (v ? applyPermissionsToggle(p, "service_mode") : { ...p, service_mode: false }));
                              setEditorAccessAllInns(v);
                              return;
                            }
                            handlePermissionsToggle(key);
                          };
                          const activeClass = superadminRowPermissionActiveClass(key, isActive);
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`permission-button ${activeClass}`}
                              onClick={onClick}
                              disabled={locked}
                              title={locked ? "Отключите «Возврат из КГД», чтобы изменить другие разделы" : undefined}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
                      {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
                        const isActive = key === "__financial__" ? editorFinancial : !!editorPermissions[key];
                        const locked = editorPermissions.red_returns === true;
                        const onClick = key === "__financial__"
                          ? () => {
                              if (locked) return;
                              setEditorSelectedPresetId("");
                              setEditorFinancial(!editorFinancial);
                            }
                          : () => handlePermissionsToggle(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`permission-button ${isActive ? "active active-warning" : ""}`}
                            onClick={onClick}
                            disabled={locked}
                            title={locked ? "Отключите «Возврат из КГД», чтобы изменить другие разделы" : undefined}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                      {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
                        const isActive = !!editorPermissions[key];
                        const dis = isDashboardPermissionDisabled(key, editorPermissions)
                          || isPermissionLockedByRedReturns(key, editorPermissions);
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`permission-button ${isActive ? "active" : ""}`}
                            onClick={() => { if (!dis) handlePermissionsToggle(key); }}
                            disabled={dis}
                            title={
                              isPermissionLockedByRedReturns(key, editorPermissions)
                                ? "Отключите «Возврат из КГД», чтобы изменить другие разделы"
                                : dis
                                  ? "Сначала включите «Аналитика»"
                                  : undefined
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!(editorPermissions.service_mode || editorAccessAllInns) && (
                    <div style={{ marginBottom: "1rem" }}>
                      <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setEditorCustomerPickOpen(true)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditorCustomerPickOpen(true); } }}
                          style={{
                            flex: 1,
                            minHeight: 80,
                            maxHeight: 160,
                            padding: "0.5rem 0.75rem",
                            background: "var(--color-bg-input)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            cursor: "pointer",
                          }}
                          aria-label="Выбрать заказчика"
                        >
                          {editorCustomers.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
                          ) : (
                            editorCustomers.map((cust) => (
                              <div
                                key={cust.inn}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "0.35rem 0.5rem",
                                  borderRadius: 6,
                                  background: "var(--color-bg-hover)",
                                }}
                              >
                                <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                  {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                                  {customerDirectoryMap[cust.inn] || cust.customer_name ? ` · ${cust.inn}` : ""}
                                </Typography.Body>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditorCustomers((prev) => prev.filter((c) => c.inn !== cust.inn)); }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    color: "var(--color-text-secondary)",
                                  }}
                                  aria-label="Удалить заказчика"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <Button type="button" className="filter-button" onClick={() => setEditorCustomerPickOpen(true)}>
                            Подбор
                          </Button>
                          {editorCustomers.length > 0 && (
                            <Button
                              type="button"
                              className="filter-button"
                              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                              onClick={() => setEditorCustomers([])}
                            >
                              Очистить
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Дифф перед сохранением
                    </Typography.Body>
                    {editorDiffItems.length === 0 ? (
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Изменений нет
                      </Typography.Body>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {editorDiffItems.map((line, idx) => (
                          <Typography.Body key={`diff-${idx}`} style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                            • {line}
                          </Typography.Body>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Журнал изменений пользователя
                    </Typography.Body>
                    <Input
                      type="text"
                      className="admin-form-input"
                      value={userChangeQuery}
                      onChange={(e) => setUserChangeQuery(e.target.value)}
                      placeholder="Фильтр по логину"
                      style={{ width: "100%", marginBottom: "0.4rem" }}
                    />
                    {userChangeLoading ? (
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Загрузка…</Typography.Body>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: 140, overflowY: "auto" }}>
                        {userChangeEntries
                          .filter((e) => {
                            const q = userChangeQuery.trim().toLowerCase();
                            if (!q) return true;
                            const login = String((e.details as Record<string, unknown> | null)?.login || "").toLowerCase();
                            return login.includes(q);
                          })
                          .map((e) => (
                            <Typography.Body key={`change-${e.id}`} style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                              {new Date(e.created_at).toLocaleString("ru-RU")} · {e.action}
                            </Typography.Body>
                          ))}
                        {userChangeEntries.length === 0 && (
                          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                            Пока нет записей
                          </Typography.Body>
                        )}
                      </div>
                    )}
                  </div>
                  {editorError && (
                    <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                      {editorError}
                    </Typography.Body>
                  )}
                  <Flex gap="0.5rem" align="center">
                    <Button className="button-primary" disabled={editorLoading} onClick={handleSaveUserPermissions}>
                      {editorLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Сохранить"}
                    </Button>
                    <Button type="button" className="filter-button" onClick={closePermissionsEditor} style={{ padding: "0.5rem 0.75rem" }} aria-label="Отмена редактирования прав">
                      Отмена
                    </Button>
                  </Flex>
                </Panel>
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
              const selectAllByFilter = () => setSelectedUserIds((prev) => {
                const s = new Set(prev);
                sorted.forEach((u) => s.add(u.id));
                return [...s];
              });
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
                      adminToken={adminToken}
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
              const bulkPanel = selectedUserIds.length > 0 ? (
                <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Групповое изменение прав ({selectedUserIds.length})</Typography.Body>
                  <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <Typography.Body style={{ fontSize: "0.85rem" }}>Пресет:</Typography.Body>
                    <select
                      className="admin-form-input"
                      style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                      value={bulkSelectedPresetId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setBulkSelectedPresetId(id);
                        const preset = permissionPresets.find((p) => p.id === id);
                        if (preset) {
                          setBulkPermissions(applyPresetPermissionsWithSendingsGate(preset.permissions, isSuperAdmin, false));
                          setBulkFinancial(preset.financial);
                          setBulkAccessAllInns(preset.serviceMode);
                        }
                      }}
                    >
                      <option value="">—</option>
                      {permissionPresets.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </Flex>
                  <div className="admin-form-section-header" style={{ marginBottom: "0.35rem" }}>Разделы</div>
                  {isSuperAdmin && (
                    <div className="admin-permissions-toolbar">
                      {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
                        const isActive = key === "service_mode" ? (!!bulkPermissions.service_mode || bulkAccessAllInns) : !!bulkPermissions[key];
                        const onClick = () => {
                          setBulkSelectedPresetId("");
                          if (key === "service_mode") {
                            const v = !(!!bulkPermissions.service_mode || bulkAccessAllInns);
                            setBulkPermissions((p) => ({ ...p, service_mode: v }));
                            setBulkAccessAllInns(v);
                            return;
                          }
                          setBulkPermissions((p) => ({ ...p, [key]: !p[key] }));
                        };
                        const activeClass = superadminRowPermissionActiveClass(key, isActive);
                        return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
                      })}
                    </div>
                  )}
                  <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
                    {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
                      const isActive = key === "__financial__" ? bulkFinancial : !!bulkPermissions[key];
                      const onClick = key === "__financial__"
                        ? () => { setBulkSelectedPresetId(""); setBulkFinancial(!bulkFinancial); }
                        : () => { setBulkSelectedPresetId(""); setBulkPermissions((p) => ({ ...p, [key]: !p[key] })); };
                      return (
                        <button key={key} type="button" className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
                      );
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                    {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
                      const dis = isDashboardPermissionDisabled(key, bulkPermissions);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`permission-button ${!!bulkPermissions[key] ? "active" : ""}`}
                          onClick={() => {
                            if (dis) return;
                            setBulkSelectedPresetId("");
                            setBulkPermissions((p) => applyPermissionsToggle(p, key));
                          }}
                          disabled={dis}
                          title={dis ? "Сначала включите «Аналитика»" : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {bulkError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{bulkError}</Typography.Body>}
                  <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginTop: "0.75rem" }}>
                    <Button className="button-primary" disabled={bulkLoading} onClick={handleBulkApplyPermissions}>
                      {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {bulkLoading ? " Применяем…" : "Применить к выбранным"}
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      disabled={bulkLoading}
                      onClick={() => setBulkDeactivateConfirmOpen(true)}
                      style={{ color: "var(--color-error, #dc2626)" }}
                    >
                      Деактивировать выбранных
                    </Button>
                    <Button className="filter-button" onClick={clearSelection}>Снять выделение</Button>
                  </Flex>
                  {bulkDeactivateConfirmOpen && (
                    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !bulkLoading && setBulkDeactivateConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="bulk-deactivate-title">
                      <div ref={bulkDeactivateModalRef} className="modal-content" style={{ maxWidth: "22rem" }} onClick={(e) => e.stopPropagation()}>
                        <Typography.Body id="bulk-deactivate-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Деактивировать выбранных?</Typography.Body>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                          Пользователи ({selectedUserIds.length}) не смогут входить в приложение. Права и заказчики сохранятся; повторная активация возможна через редактирование.
                        </Typography.Body>
                        <Flex gap="0.5rem" wrap="wrap">
                          <Button
                            type="button"
                            disabled={bulkLoading}
                            onClick={handleBulkDeactivate}
                            style={{ background: "var(--color-error, #dc2626)", color: "#fff", border: "none" }}
                            aria-label="Деактивировать выбранных пользователей"
                          >
                            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Деактивировать"}
                          </Button>
                          <Button type="button" className="filter-button" disabled={bulkLoading} onClick={() => setBulkDeactivateConfirmOpen(false)} aria-label="Отмена">
                            Отмена
                          </Button>
                        </Flex>
                      </div>
                    </div>
                  )}
                </Panel>
              ) : null;
              if (usersViewMode === "login") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Flex gap="0.5rem" align="center" style={{ flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выбрать:</Typography.Body>
                      <Button type="button" className="filter-button" onClick={selectAllOnPage} style={{ padding: "0.35rem 0.6rem" }}>Все на странице</Button>
                      <Button type="button" className="filter-button" onClick={selectAllByFilter} style={{ padding: "0.35rem 0.6rem" }}>Все по фильтру</Button>
                      <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                      {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                    </Flex>
                    {bulkPanel}
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
              const CUSTOMER_ALL = "Доступ ко всем заказчикам";
              const groups = new Map<string, User[]>();
              const companyRowMatchesSearch = (c: { inn?: string; name?: string }) => {
                if (!q) return true;
                return innMatchesSearchQuery(c.inn, q) || legalEntityNameMatchesQuery(c.name || "", q);
              };
              const addToGroup = (label: string, user: User) => {
                const list = groups.get(label) ?? [];
                if (!list.some((x) => x.id === user.id)) list.push(user);
                groups.set(label, list);
              };
              for (const u of visibleSorted) {
                // Логины с доступом ко всем заказчикам всегда показываем только в отдельной группе,
                // чтобы не дублировать их в каждой группе заказчиков.
                if (u.access_all_inns || !!u.permissions?.service_mode) {
                  addToGroup(CUSTOMER_ALL, u);
                  continue;
                }
                let placed = false;
                if (u.companies && u.companies.length > 0) {
                  for (const c of u.companies) {
                    if (!companyRowMatchesSearch(c)) continue;
                    const label = c.name?.trim() ? `${c.name} (${c.inn})` : c.inn;
                    addToGroup(label, u);
                    placed = true;
                  }
                  if (!placed) addToGroup(CUSTOMER_ALL, u);
                } else if (u.inn) {
                  if (companyRowMatchesSearch({ inn: u.inn, name: u.company_name || "" })) {
                    const label = u.company_name?.trim() ? `${u.company_name} (${u.inn})` : u.inn;
                    addToGroup(label, u);
                  } else {
                    addToGroup(CUSTOMER_ALL, u);
                  }
                } else {
                  addToGroup(CUSTOMER_ALL, u);
                }
              }
              const sortedLabels = Array.from(groups.keys()).sort((a, b) => (a === CUSTOMER_ALL ? 1 : b === CUSTOMER_ALL ? -1 : a.localeCompare(b)));
              const groupDisplayName = (l: string) => {
                if (l === CUSTOMER_ALL) return l;
                const inParens = /\((\d{10,12})\)$/.exec(l);
                const inn = inParens ? inParens[1] : /^\d{10,12}$/.test(l) ? l : null;
                if (inn && customerDirectoryMap[inn]) return `${customerDirectoryMap[inn]} (${inn})`;
                return l;
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <Flex gap="0.5rem" align="center" style={{ flexWrap: "wrap", marginBottom: "0.25rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выбрать:</Typography.Body>
                    <Button type="button" className="filter-button" onClick={selectAllOnPage} style={{ padding: "0.35rem 0.6rem" }}>Все на странице</Button>
                    <Button type="button" className="filter-button" onClick={selectAllByFilter} style={{ padding: "0.35rem 0.6rem" }}>Все по фильтру</Button>
                    <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                    {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                  </Flex>
                  {bulkPanel}
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
                      const latestLoginLabel = latestLoginMs
                        ? (() => {
                            const now = Date.now();
                            const diffM = Math.floor((now - latestLoginMs) / 60000);
                            const diffH = Math.floor((now - latestLoginMs) / 3600000);
                            const diffD = Math.floor((now - latestLoginMs) / 86400000);
                            if (diffM < 1) return "только что";
                            if (diffM < 60) return `${diffM} мин назад`;
                            if (diffH < 24) return `${diffH} ч назад`;
                            if (diffD < 7) return `${diffD} дн назад`;
                            return formatDisplayDate(new Date(latestLoginMs).toISOString());
                          })()
                        : "нет входов";
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
                              borderLeft: `4px solid rgba(0, 113, 227, ${label === CUSTOMER_ALL ? 0.14 : 0.28})`,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Typography.Body style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{groupDisplayName(label)}</Typography.Body>
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
            })()}
          </Panel>
        </>

        {showAddUserForm && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
          <Flex align="center" justify="space-between" style={{ marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600 }}>Регистрация пользователя</Typography.Body>
            <Button type="button" className="filter-button" onClick={() => setShowAddUserForm(false)} aria-label="Закрыть форму регистрации">
              Отмена
            </Button>
          </Flex>
          <form onSubmit={handleAddUser}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
              {(formAccessAllInns || formPermissions.service_mode) ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Служебный режим — выбор заказчика не требуется</Typography.Body>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setCustomerPickModalOpen(true)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCustomerPickModalOpen(true); } }}
                      style={{
                        flex: 1,
                        minHeight: 160,
                        maxHeight: 260,
                        padding: "0.75rem",
                        background: "var(--color-bg-input)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}
                      aria-label="Выбрать заказчика"
                    >
                      {selectedCustomers.length === 0 ? (
                        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
                      ) : (
                        selectedCustomers.map((cust) => (
                          <div
                            key={cust.inn}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.35rem 0.5rem",
                              borderRadius: 6,
                              background: "var(--color-bg-hover)",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                                {(customerDirectoryMap[cust.inn] || cust.customer_name) ? ` · ${cust.inn}` : ""}
                              </Typography.Body>
                              {cust.email && (
                                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                  {cust.email}
                                </Typography.Body>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeSelectedCustomer(cust.inn); }}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "var(--color-text-secondary)",
                              }}
                              aria-label="Удалить заказчика"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <Button
                        className="filter-button"
                        type="button"
                        onClick={() => setCustomerPickModalOpen(true)}
                      >
                        Подбор
                      </Button>
                      {selectedCustomers.length > 0 && (
                        <Button
                          className="filter-button"
                          type="button"
                          onClick={clearCustomerSelection}
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Очистить
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
              <label htmlFor="form-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Email</label>
              <Input id="form-email" className="admin-form-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
              {formEmailError && (
                <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
                  {formEmailError}
                </Typography.Body>
              )}
            </div>
            <div className="admin-form-section">
              <Flex align="center" gap="var(--element-gap, 0.5rem)" style={{ marginBottom: "var(--space-2, 0.5rem)", flexWrap: "wrap" }}>
                <label htmlFor="form-preset" style={{ fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Пресет:</label>
                <select
                  id="form-preset"
                  className="admin-form-input"
                  style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                  value={formSelectedPresetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setFormSelectedPresetId(id);
                    const preset = permissionPresets.find((p) => p.id === id);
                    if (preset) {
                      setFormPermissions(applyPresetPermissionsWithSendingsGate(preset.permissions, isSuperAdmin, false));
                      setFormFinancial(preset.financial);
                      setFormAccessAllInns(preset.serviceMode);
                      if (preset.serviceMode) clearCustomerSelection();
                    }
                  }}
                >
                  <option value="">—</option>
                  {permissionPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Flex>
              <div className="admin-form-section-header">Разделы</div>
              {isSuperAdmin && (
                <div className="admin-permissions-toolbar">
                  {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
                    const isActive = key === "service_mode" ? (!!formPermissions.service_mode || formAccessAllInns) : !!formPermissions[key];
                    const onClick = () => {
                      setFormSelectedPresetId("");
                      if (key === "service_mode") {
                        const v = !(!!formPermissions.service_mode || formAccessAllInns);
                        setFormPermissions((p) => ({ ...p, service_mode: v }));
                        setFormAccessAllInns(v);
                        if (v) clearCustomerSelection();
                        return;
                      }
                      togglePerm(key);
                    };
                    const activeClass = superadminRowPermissionActiveClass(key, isActive);
                    return (
                      <button type="button" key={key} className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>
                    );
                  })}
                </div>
              )}
              <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
                {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
                  const isActive = key === "__financial__" ? formFinancial : !!formPermissions[key];
                  const onClick = key === "__financial__"
                    ? () => { setFormSelectedPresetId(""); setFormFinancial(!formFinancial); }
                    : () => togglePerm(key);
                  return (
                    <button type="button" key={key} className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
                  );
                })}
              </div>
              <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
                  const isActive = !!formPermissions[key];
                  const dis = isDashboardPermissionDisabled(key, formPermissions);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`permission-button ${isActive ? "active" : ""}`}
                      onClick={() => { if (!dis) togglePerm(key); }}
                      disabled={dis}
                      title={dis ? "Сначала включите «Аналитика»" : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center">
                <input
                  type="checkbox"
                  checked={formSendEmail}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormSendEmail(checked);
                    if (checked) setFormPassword("");
                  }}
                  id="sendEmail"
                />
                <label htmlFor="sendEmail" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Отправить пароль на email</label>
              </Flex>
            </div>
            {!formSendEmail && (
              <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
                <label htmlFor="form-password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Пароль</label>
                <div className="password-input-container" style={{ position: "relative" }}>
                  <Input
                    id="form-password"
                    className="admin-form-input password"
                    type={formPasswordVisible ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Минимум 8 символов, буквы и цифры"
                    style={{ width: "100%" }}
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-password-visibility"
                    onClick={() => setFormPasswordVisible((prev) => !prev)}
                    aria-label={formPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {formPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                  Минимум 8 символов, обязательно буквы и цифры. Простые пароли (123, password и т.п.) запрещены.
                </Typography.Body>
              </div>
            )}
            {formResult?.password && (
              <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-success-status)", fontSize: "0.9rem" }}>
                Пароль: {formResult.password}
                {formResult.emailSent ? " (отправлен на email)" : " — сохраните, email не отправлен"}
              </Typography.Body>
            )}
            <Button type="submit" className="filter-button" disabled={formSubmitting || !!formEmailError}>
              {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрировать"}
            </Button>
          </form>
        </Panel>
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
