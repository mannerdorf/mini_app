import { useCallback, useMemo, useState } from "react";
import type { CustomerItem } from "../../../components/modals/CustomerPickModal";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { registerAdminUser } from "../../../api/client/admin/users";
import {
  applyPermissionsToggle,
  createDefaultPermissions,
  isSuperadminOnlyPermissionKey,
  permissionsForAdminEditor,
} from "../lib/permissions";
import { isPasswordStrongEnough } from "../lib/password";
import type { User } from "../types/adminUsers";

export type UseAdminUserRegistrationParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  users: User[];
  usersSearchQuery: string;
  matchesUserSearch: (user: User, query: string) => boolean;
  onError: (msg: string | null) => void;
  fetchUsers: () => Promise<void>;
};

export function useAdminUserRegistration({
  adminToken,
  isSuperAdmin,
  users,
  usersSearchQuery,
  matchesUserSearch,
  onError,
  fetchUsers,
}: UseAdminUserRegistrationParams) {
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [formAccessAllInns, setFormAccessAllInns] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerItem[]>([]);
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>(() =>
    createDefaultPermissions({ supervisor: true }),
  );
  const [formSelectedPresetId, setFormSelectedPresetId] = useState<string>("");
  const [formFinancial, setFormFinancial] = useState(true);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);
  const [customerPickModalOpen, setCustomerPickModalOpen] = useState(false);

  const togglePerm = useCallback(
    (key: string) => {
      if (!isSuperAdmin && isSuperadminOnlyPermissionKey(key)) return;
      setFormSelectedPresetId("");
      setFormPermissions((p) => applyPermissionsToggle(p, key));
    },
    [isSuperAdmin],
  );

  const fetchCustomersForModal = useCallback(
    async (query: string): Promise<CustomerItem[]> => {
      const customers = await searchAdminCustomers(adminToken, { q: query, limit: 200 });
      return customers.map((c) => ({
        inn: c.inn,
        customer_name: c.customer_name,
        email: c.email || "",
      }));
    },
    [adminToken],
  );

  const clearCustomerSelection = useCallback(() => setSelectedCustomers([]), []);

  const addSelectedCustomer = useCallback((customer: CustomerItem) => {
    setSelectedCustomers((prev) => {
      if (prev.find((c) => c.inn === customer.inn)) return prev;
      return [...prev, customer];
    });
  }, []);

  const removeSelectedCustomer = useCallback((inn: string) => {
    setSelectedCustomers((prev) => prev.filter((c) => c.inn !== inn));
  }, []);

  const registerEntry = useCallback(
    async (entry: { login: string; password: string; inn?: string; customer?: string }) => {
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
    },
    [formSendEmail, formPassword, isSuperAdmin, formPermissions, formFinancial, formAccessAllInns, selectedCustomers, adminToken],
  );

  const formEmailError = useMemo(() => {
    const value = formEmail.trim();
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "Некорректный формат email";
    const duplicate = users.some((u) => String(u.login || "").trim().toLowerCase() === normalized);
    if (duplicate) return "Пользователь с таким email уже существует";
    return null;
  }, [formEmail, users]);

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

  const handleAddUser = useCallback(
    async (e: React.FormEvent) => {
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
      } catch (err: unknown) {
        onError((err as Error).message);
      } finally {
        setFormSubmitting(false);
      }
    },
    [
      formEmail,
      users,
      formAccessAllInns,
      formPermissions.service_mode,
      selectedCustomers.length,
      formSendEmail,
      formPassword,
      registerEntry,
      onError,
      fetchUsers,
    ],
  );

  return {
    showAddUserForm,
    setShowAddUserForm,
    formAccessAllInns,
    setFormAccessAllInns,
    selectedCustomers,
    formEmail,
    setFormEmail,
    formPermissions,
    setFormPermissions,
    formSelectedPresetId,
    setFormSelectedPresetId,
    formFinancial,
    setFormFinancial,
    formSendEmail,
    setFormSendEmail,
    formPassword,
    setFormPassword,
    formPasswordVisible,
    setFormPasswordVisible,
    formSubmitting,
    formResult,
    customerPickModalOpen,
    setCustomerPickModalOpen,
    formEmailError,
    togglePerm,
    fetchCustomersForModal,
    clearCustomerSelection,
    addSelectedCustomer,
    removeSelectedCustomer,
    openAddUserForm,
    handleAddUser,
  };
}

export type AdminUserRegistrationState = ReturnType<typeof useAdminUserRegistration>;
