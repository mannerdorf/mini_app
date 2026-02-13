import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Loader2, Plus, Settings, LogOut, Trash2, Eye, EyeOff, FileUp, Activity } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { CustomerPickModal, type CustomerItem } from "../components/modals/CustomerPickModal";

declare global {
  interface Window {
    XLSX?: any;
  }
}


const PERMISSION_KEYS = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
  { key: "chat", label: "Чат" },
  { key: "service_mode", label: "Служебный режим" },
] as const;

type AuthMethodsConfig = {
  api_v1: boolean;
  api_v2: boolean;
  cms: boolean;
};

const AUTH_METHODS = [
  { key: "api_v1", label: "API 1С v1", description: "GetPerevozki" },
  { key: "api_v2", label: "API 1С v2", description: "GetCustomers" },
  { key: "cms", label: "CMS", description: "email / пароль" },
] as const;

type AuthMethodKey = (typeof AUTH_METHODS)[number]["key"];

type AdminPageProps = {
  adminToken: string;
  onBack: () => void;
  /** При 401 вызывается как onLogout("expired"), при нажатии «Выход» — onLogout() */
  onLogout?: (reason?: "expired") => void;
};

type User = {
  id: number;
  login: string;
  inn: string;
  company_name: string;
  permissions: Record<string, boolean>;
  financial_access: boolean;
  access_all_inns?: boolean;
  active: boolean;
  created_at: string;
};

function UserRow({
  user,
  adminToken,
  onToggleActive,
  onEditPermissions,
}: {
  user: User;
  adminToken: string;
  onToggleActive: () => Promise<void>;
  onEditPermissions: (user: User) => void;
}) {
  const [loading, setLoading] = useState(false);
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
      style={{
        padding: "0.75rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: user.active ? "var(--color-bg-hover)" : "var(--color-bg-input)",
        opacity: user.active ? 1 : 0.85,
      }}
    >
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="0.5rem">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Body style={{ fontWeight: 600 }}>{user.login}</Typography.Body>
        </div>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Профиль</Typography.Body>
          <span onClick={(e) => e.stopPropagation()} style={{ cursor: loading ? "wait" : "pointer" }}>
            <TapSwitch checked={user.active} onToggle={handleToggle} />
          </span>
          <Button
            className="filter-button"
            style={{ padding: "0.25rem 0.75rem" }}
            onClick={(e) => {
              e.stopPropagation();
              onEditPermissions(user);
            }}
            disabled={loading}
          >
            Права
          </Button>
        </Flex>
      </Flex>
    </div>
  );
}

export function AdminPage({ adminToken, onBack, onLogout }: AdminPageProps) {
  const [tab, setTab] = useState<"users" | "add" | "batch" | "email">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formAccessAllInns, setFormAccessAllInns] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerItem[]>([]);
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({
    cms_access: false,
    cargo: true,
    doc_invoices: true,
    doc_acts: true,
    doc_orders: false,
    doc_claims: false,
    doc_contracts: false,
    doc_acts_settlement: false,
    doc_tariffs: false,
    chat: true,
    service_mode: false,
  });
  const [formFinancial, setFormFinancial] = useState(true);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);
  const [batchEntries, setBatchEntries] = useState<{ login: string; password: string; inn?: string; customer?: string }[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [authMethodsConfig, setAuthMethodsConfig] = useState<AuthMethodsConfig>({
    api_v1: true,
    api_v2: true,
    cms: true,
  });
  const [authConfigLoading, setAuthConfigLoading] = useState(false);
  const [authConfigSaving, setAuthConfigSaving] = useState(false);
  const [authConfigError, setAuthConfigError] = useState<string | null>(null);
  const [authConfigMessage, setAuthConfigMessage] = useState<string | null>(null);

  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailFromName, setEmailFromName] = useState("HAULZ");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

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
  const [topActiveUsers, setTopActiveUsers] = useState<{ id: number; login: string; company_name: string; last_login_at: string | null }[]>([]);
  const [topActiveLoading, setTopActiveLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout?.("expired");
        return;
      }
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onLogout]);

  const fetchTopActive = useCallback(async () => {
    setTopActiveLoading(true);
    try {
      const res = await fetch("/api/admin-top-active?limit=15", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout?.("expired");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setTopActiveUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setTopActiveLoading(false);
    }
  }, [adminToken, onLogout]);

  const fetchAuthConfig = useCallback(async () => {
    setAuthConfigLoading(true);
    setAuthConfigError(null);
    setAuthConfigMessage(null);
    try {
      const res = await fetch("/api/admin-auth-config", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout?.("expired");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка загрузки способов авторизации");
      const config = data.config || {};
      setAuthMethodsConfig({
        api_v1: config.api_v1 ?? true,
        api_v2: config.api_v2 ?? true,
        cms: config.cms ?? true,
      });
    } catch (e: unknown) {
      setAuthConfigError((e as Error)?.message || "Ошибка загрузки способов авторизации");
    } finally {
      setAuthConfigLoading(false);
    }
  }, [adminToken, onLogout]);

  const fetchEmailSettings = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin-email-settings", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout?.("expired");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data?.error as string) || "Ошибка загрузки настроек почты");
        return;
      }
      setEmailHost(data.smtp_host || "");
      setEmailPort(String(data.smtp_port ?? ""));
      setEmailUser(data.smtp_user || "");
      setEmailFrom(data.from_email || "");
      setEmailFromName(data.from_name || "HAULZ");
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки настроек почты");
    }
  }, [adminToken, onLogout]);

  useEffect(() => {
    if (tab === "users") {
      fetchUsers();
      fetchAuthConfig();
      fetchTopActive();
    }
    if (tab === "email") fetchEmailSettings();
  }, [tab, fetchUsers, fetchEmailSettings, fetchAuthConfig, fetchTopActive]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormResult(null);
    setError(null);
    if (!formAccessAllInns && selectedCustomers.length === 0) {
      setError("Выберите заказчика из справочника или включите доступ ко всем ИНН");
      setFormSubmitting(false);
      return;
    }
    if (!formSendEmail && !formPassword) {
      setError("Введите пароль вручную или включите отправку на email");
      setFormSubmitting(false);
      return;
    }

    const entry = {
      login: formEmail.trim(),
      password: formPassword,
      customer: selectedCustomers[0]?.customer_name,
    };
    if (!entry.login) {
      setError("Введите email");
      setFormSubmitting(false);
      return;
    }
    try {
      await registerEntry(entry);
      const baseResult = formSendEmail
        ? { emailSent: true }
        : { password: formPassword, emailSent: false };
      setFormResult(baseResult);
      setSelectedCustomers([]);
      setFormEmail("");
      setFormPassword("");
      setCustomerPickModalOpen(false);
      fetchUsers();
      setTab("users");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-email-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          smtp_host: emailHost.trim() || undefined,
          smtp_port: emailPort ? parseInt(emailPort, 10) : undefined,
          smtp_user: emailUser.trim() || undefined,
          smtp_password: emailPassword.trim() || undefined,
          from_email: emailFrom.trim() || undefined,
          from_name: emailFromName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка сохранения");
      setEmailPassword("");
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setEmailSaving(false);
    }
  };

  const togglePerm = (key: string) => {
    setFormPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const fetchCustomersForModal = useCallback(
    async (query: string): Promise<CustomerItem[]> => {
      const res = await fetch(
        `/api/admin-customers-search?q=${encodeURIComponent(query)}&limit=200`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка загрузки справочника");
      return data.customers || [];
    },
    [adminToken]
  );

  const clearCustomerSelection = () => {
    setSelectedCustomers([]);
  };

  const addSelectedCustomer = (customer: CustomerItem) => {
    setSelectedCustomers((prev) => {
      if (prev.find((c) => c.inn === customer.inn)) return prev;
      return [...prev, customer];
    });
  };

  const removeSelectedCustomer = (inn: string) => {
    setSelectedCustomers((prev) => prev.filter((c) => c.inn !== inn));
  };

  const parseTextEntries = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const entries: typeof batchEntries = [];
    const errors: string[] = [];
    for (const line of lines) {
      const parts = line.split("/");
      if (parts.length < 2) {
        errors.push(`Строка "${line}" пропущена — формат login/password[/customer]`);
        continue;
      }
      entries.push({
        login: parts[0].trim(),
        password: parts[1].trim(),
        customer: parts[2]?.trim(),
      });
    }
    return { entries, errors };
  };

  const loadXlsxLibrary = (() => {
    let promise: Promise<any> | null = null;
    return () => {
      if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
      if (promise) return promise;
      promise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.sheetjs.com/xlsx-0.22.2/package/xlsx.full.min.js";
        script.onload = () => resolve((window as any).XLSX);
        script.onerror = () => reject(new Error("Не удалось загрузить библиотеку для Excel"));
        document.body.appendChild(script);
      });
      return promise;
    };
  })();

  const parseExcelEntries = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const XLSX = await loadXlsxLibrary();
    const workbook = XLSX.read(new Uint8Array(bytes), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    const entries: typeof batchEntries = [];
    const errors: string[] = [];
    for (const row of matrix) {
      const [login, password, customer] = row.map((cell) => (typeof cell === "string" ? cell.trim() : ""));
      if (!login || !password) {
        if (login || password) errors.push(`Пропущена строка "${row.join("/")}" — укажите login и password`);
        continue;
      }
      entries.push({ login, password, customer });
    }
    return { entries, errors };
  };

  const handleBatchFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBatchError(null);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const { entries, errors } = isExcel
        ? await parseExcelEntries(file)
        : parseTextEntries(await file.text());
      if (entries.length === 0) {
        throw new Error("Файл не содержит допустимых записей");
      }
      setBatchEntries(entries);
      if (errors.length) {
        setBatchError(errors.join("; "));
      }
    } catch (e: unknown) {
      setBatchEntries([]);
      setBatchError((e as Error)?.message || "Не удалось прочитать файл");
    } finally {
      event.target.value = "";
    }
  };

  const registerEntry = async (entry: { login: string; password: string; customer?: string }) => {
    const payload: any = {
      login: entry.login.trim(),
      email: entry.login.trim(),
      password: formSendEmail ? undefined : entry.password || formPassword,
      send_email: formSendEmail,
      permissions: formPermissions,
      financial_access: formFinancial,
      access_all_inns: formAccessAllInns,
    };
    if (selectedCustomers.length > 0) {
      payload.customers = selectedCustomers.map((c) => ({
        inn: c.inn,
        name: c.customer_name,
      }));
    } else if (entry.customer) {
      payload.customers = [{ name: entry.customer, inn: "" }];
    }
    const res = await fetch("/api/admin-register-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "Ошибка регистрации");
    }
    return data;
  };

  const handleBatchRegister = async () => {
    if (batchEntries.length === 0) {
      setBatchError("Выберите файл с логинами");
      return;
    }
    setBatchLoading(true);
    setBatchError(null);
    try {
      for (const entry of batchEntries) {
        await registerEntry(entry);
      }
      setBatchEntries([]);
      setFormResult({ password: batchEntries[0]?.password, emailSent: formSendEmail });
    } catch (e: unknown) {
      setBatchError((e as Error)?.message || "Ошибка пакетной регистрации");
    } finally {
      setBatchLoading(false);
    }
  };

  const openPermissionsEditor = (user: User) => {
    setSelectedUser(user);
  };

  const closePermissionsEditor = () => {
    setSelectedUser(null);
    setResetPasswordInfo(null);
  };

  const handlePermissionsToggle = (key: string) => {
    setEditorPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveUserPermissions = async () => {
    if (!selectedUser) return;
    setEditorLoading(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/admin-user-update?id=${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          permissions: editorPermissions,
          financial_access: editorFinancial,
          access_all_inns: editorAccessAllInns,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка сохранения");
      await fetchUsers();
      setSelectedUser(null);
    } catch (e: unknown) {
      setEditorError((e as Error)?.message || "Ошибка сохранения");
    } finally {
      setEditorLoading(false);
    }
  };

  const handleToggleAuthMethod = (key: AuthMethodKey) => {
    setAuthMethodsConfig((prev) => ({ ...prev, [key]: !prev[key] }));
    setAuthConfigMessage(null);
  };

  const handleSaveAuthConfig = async () => {
    setAuthConfigSaving(true);
    setAuthConfigError(null);
    setAuthConfigMessage(null);
    try {
      const res = await fetch("/api/admin-auth-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(authMethodsConfig),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка сохранения способов авторизации");
      const config = data.config || authMethodsConfig;
      setAuthMethodsConfig({
        api_v1: config.api_v1 ?? authMethodsConfig.api_v1,
        api_v2: config.api_v2 ?? authMethodsConfig.api_v2,
        cms: config.cms ?? authMethodsConfig.cms,
      });
      setAuthConfigMessage("Способы авторизации обновлены");
    } catch (e: unknown) {
      setAuthConfigError((e as Error)?.message || "Ошибка сохранения способов авторизации");
    } finally {
      setAuthConfigSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setEditorError(null);
    setResetPasswordInfo(null);
    try {
      const res = await fetch(`/api/admin-user-update?id=${selectedUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reset_password: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка сброса пароля");
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
    const nextPermissions = PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, perm) => {
      acc[perm.key] = Boolean(selectedUser.permissions?.[perm.key]);
      return acc;
    }, {});
    setEditorPermissions(nextPermissions);
    setEditorFinancial(Boolean(selectedUser.financial_access));
    setEditorAccessAllInns(Boolean(selectedUser.access_all_inns));
    setEditorError(null);
  }, [selectedUser]);

  return (
    <div className="w-full">
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.75rem">
          <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
        </Flex>
        {onLogout && (
          <Button className="filter-button" onClick={onLogout} style={{ padding: "0.5rem 0.75rem" }}>
            <LogOut className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Выход
          </Button>
        )}
      </Flex>

      <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button
          className="filter-button"
          style={{ background: tab === "users" ? "var(--color-primary-blue)" : undefined, color: tab === "users" ? "white" : undefined }}
          onClick={() => setTab("users")}
        >
          <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Пользователи
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "add" ? "var(--color-primary-blue)" : undefined, color: tab === "add" ? "white" : undefined }}
          onClick={() => setTab("add")}
        >
          <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Регистрация
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "batch" ? "var(--color-primary-blue)" : undefined, color: tab === "batch" ? "white" : undefined }}
          onClick={() => setTab("batch")}
        >
          <FileUp className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Массовая регистрация
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "email" ? "var(--color-primary-blue)" : undefined, color: tab === "email" ? "white" : undefined }}
          onClick={() => setTab("email")}
        >
          <Settings className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Почта
        </Button>
      </Flex>

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</Typography.Body>
      )}

      {tab === "users" && (
        <>
          <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Варианты верификации</Typography.Body>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
              Включите или отключите способы входа для пользователей
            </Typography.Body>
            {authConfigLoading ? (
              <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
              </Flex>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {AUTH_METHODS.map((method) => (
                  <Flex key={method.key} justify="space-between" align="center">
                    <div style={{ minWidth: 0 }}>
                      <Typography.Body style={{ fontWeight: 600 }}>{method.label}</Typography.Body>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                        {method.description}
                      </Typography.Body>
                    </div>
                    <TapSwitch checked={authMethodsConfig[method.key]} onToggle={() => handleToggleAuthMethod(method.key)} />
                  </Flex>
                ))}
              </div>
            )}
            {authConfigError && (
              <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {authConfigError}
              </Typography.Body>
            )}
            {authConfigMessage && (
              <Typography.Body style={{ color: "var(--color-success-status)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {authConfigMessage}
              </Typography.Body>
            )}
            <Button
              className="button-primary"
              style={{ marginTop: "0.75rem" }}
              onClick={handleSaveAuthConfig}
              disabled={authConfigSaving || authConfigLoading}
            >
              {authConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить варианты верификации"}
            </Button>
          </Panel>

          <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Activity className="w-4 h-4" />
              Топ активных пользователей
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
              По последнему входу в приложение
            </Typography.Body>
            {topActiveLoading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
              </Flex>
            ) : topActiveUsers.length === 0 ? (
              <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Нет данных о входах</Typography.Body>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {topActiveUsers.map((u, i) => (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.4rem 0.5rem",
                      background: "var(--color-bg-hover)",
                      borderRadius: 6,
                      flexWrap: "wrap",
                      gap: "0.25rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{i + 1}. {u.login}</span>
                    <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      {u.last_login_at
                        ? (() => {
                            const d = new Date(u.last_login_at);
                            const now = new Date();
                            const diffMs = now.getTime() - d.getTime();
                            const diffM = Math.floor(diffMs / 60000);
                            const diffH = Math.floor(diffMs / 3600000);
                            const diffD = Math.floor(diffMs / 86400000);
                            if (diffM < 1) return "только что";
                            if (diffM < 60) return `${diffM} мин назад`;
                            if (diffH < 24) return `${diffH} ч назад`;
                            if (diffD < 7) return `${diffD} дн назад`;
                            return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
                          })()
                        : "никогда"}
                    </Typography.Body>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {selectedUser && (
            <Panel className="cargo-card" style={{ padding: "1rem", marginTop: "1rem" }}>
              <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem", gap: "0.5rem" }}>
                <div>
                  <Typography.Body style={{ fontWeight: 600 }}>Права — {selectedUser.login}</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выданы по email {selectedUser.login}</Typography.Body>
                </div>
                <Flex gap="0.5rem" align="center">
                  <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={handleResetPassword}>
                    Сбросить пароль
                  </Button>
                  <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={closePermissionsEditor}>
                    Закрыть
                  </Button>
                </Flex>
              </Flex>
              {resetPasswordInfo && (
                <Typography.Body style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--color-text-secondary)" }}>
                  {resetPasswordInfo.emailSent
                    ? "Пароль отправлен на email."
                    : `Новый временный пароль: ${resetPasswordInfo.password || "—"}. Передайте его пользователю.`}
                  {resetPasswordInfo.emailError && ` Ошибка отправки: ${resetPasswordInfo.emailError}`}
                </Typography.Body>
              )}
              <Flex justify="space-between" align="center" style={{ marginBottom: "1rem" }}>
                <Typography.Body style={{ fontSize: "0.9rem" }}>Финансовый доступ</Typography.Body>
                <TapSwitch checked={editorFinancial} onToggle={() => setEditorFinancial((prev) => !prev)} />
              </Flex>
              <div className="admin-form-section" style={{ marginBottom: "0.5rem" }}>
                <div className="admin-form-section-header">Разделы</div>
                <div className="admin-permissions-toolbar">
                  {PERMISSION_KEYS.map((perm) => (
                    <button
                      key={perm.key}
                      type="button"
                      className={`permission-button ${editorPermissions[perm.key] ? "active" : ""} ${perm.key === "service_mode" && editorPermissions[perm.key] ? "active-danger" : ""}`}
                      onClick={() => handlePermissionsToggle(perm.key)}
                    >
                      {perm.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`permission-button ${editorAccessAllInns ? "active active-danger" : ""}`}
                    onClick={() => setEditorAccessAllInns((prev) => !prev)}
                  >
                    Доступ ко всем заказчикам
                  </button>
                </div>
              </div>
              {editorError && (
                <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                  {editorError}
                </Typography.Body>
              )}
              <Flex gap="0.5rem">
                <Button className="button-primary" disabled={editorLoading} onClick={handleSaveUserPermissions}>
                  {editorLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Сохранить права"}
                </Button>
                <Button className="filter-button" onClick={closePermissionsEditor} style={{ padding: "0.5rem 0.75rem" }}>
                  Отмена
                </Button>
              </Flex>
            </Panel>
          )}
          <Panel className="cargo-card" style={{ padding: "1rem" }}>
            {loading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка...</Typography.Body>
              </Flex>
            ) : users.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет зарегистрированных пользователей</Typography.Body>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    adminToken={adminToken}
                    onToggleActive={async () => {
                      const next = !u.active;
                      try {
                        const res = await fetch(`/api/admin-user-update?id=${u.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                          body: JSON.stringify({ active: next }),
                        });
                        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Ошибка");
                        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: next } : x)));
                      } catch (e: unknown) {
                        setError((e as Error)?.message || "Ошибка обновления");
                      }
                    }}
                    onEditPermissions={openPermissionsEditor}
                  />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === "batch" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <div className="admin-form-section" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="admin-form-section-header">Массовая регистрация</div>
            <div className="admin-file-input-wrap">
              <Input className="admin-form-input admin-file-input" type="file" accept=".txt,.csv,.xls,.xlsx" onChange={handleBatchFile} />
            </div>
            {batchEntries.length > 0 && (
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Загружено записей: {batchEntries.length}
              </Typography.Body>
            )}
            {batchError && (
              <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem" }}>{batchError}</Typography.Body>
            )}
            <Button className="filter-button" type="button" disabled={batchLoading || batchEntries.length === 0} onClick={handleBatchRegister}>
              {batchLoading ? "Загружаем..." : "Зарегистрировать из файла"}
            </Button>
          </div>
        </Panel>
      )}

      {tab === "add" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <form onSubmit={handleAddUser}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик (из справочника)</Typography.Body>
              {formAccessAllInns ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Доступ ко всем заказчикам — выбор не требуется</Typography.Body>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div
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
                      }}
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
                                {cust.inn} · {cust.customer_name}
                              </Typography.Body>
                              {cust.email && (
                                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                  {cust.email}
                                </Typography.Body>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSelectedCustomer(cust.inn)}
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
                  {batchEntries.length > 0 && (
                    <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                      Пароль берётся из загруженного файла.
                    </Typography.Body>
                  )}
                </>
              )}
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Email (логин)</Typography.Body>
              <Input className="admin-form-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center" style={{ marginBottom: "0.5rem" }}>
                <input type="checkbox" checked={formFinancial} onChange={(e) => setFormFinancial(e.target.checked)} id="fin" />
                <label htmlFor="fin" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Финансовые показатели</label>
              </Flex>
            </div>
            <div className="admin-form-section">
              <div className="admin-form-section-header">Разделы</div>
              <div className="admin-permissions-toolbar">
                {PERMISSION_KEYS.map(({ key, label }) => (
                  <button
                    type="button"
                    key={key}
                    className={`permission-button ${formPermissions[key] ? "active" : ""} ${key === "service_mode" && formPermissions[key] ? "active-danger" : ""}`}
                    onClick={() => togglePerm(key)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`permission-button ${formAccessAllInns ? "active active-danger" : ""}`}
                  onClick={() => {
                    const v = !formAccessAllInns;
                    setFormAccessAllInns(v);
                    if (v) clearCustomerSelection();
                  }}
                >
                  Доступ ко всем заказчикам
                </button>
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
              <div style={{ marginBottom: "1rem" }}>
                <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Пароль</Typography.Body>
                <div className="password-input-container" style={{ position: "relative" }}>
                  <Input
                    className="admin-form-input password"
                    type={formPasswordVisible ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Введите пароль вручную"
                    style={{ width: "100%" }}
                    disabled={batchEntries.length > 0}
                  />
                  <button
                    type="button"
                    className="toggle-password-visibility"
                    onClick={() => setFormPasswordVisible((prev) => !prev)}
                    aria-label={formPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                    disabled={batchEntries.length > 0}
                  >
                    {formPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {batchEntries.length > 0 && (
                  <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                    Пароль берётся из загруженного файла.
                  </Typography.Body>
                )}
              </div>
            )}
            {formResult?.password && (
              <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-success-status)", fontSize: "0.9rem" }}>
                Пароль: {formResult.password}
                {formResult.emailSent ? " (отправлен на email)" : " — сохраните, email не отправлен"}
              </Typography.Body>
            )}
            <Button type="submit" className="filter-button" disabled={formSubmitting}>
              {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрировать"}
            </Button>
          </form>
        </Panel>
      )}

      {tab === "email" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <form onSubmit={handleSaveEmail}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP хост</Typography.Body>
              <Input className="admin-form-input" value={emailHost} onChange={(e) => setEmailHost(e.target.value)} placeholder="smtp.example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP порт</Typography.Body>
              <Input className="admin-form-input" type="number" value={emailPort} onChange={(e) => setEmailPort(e.target.value)} placeholder="587" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пользователь</Typography.Body>
              <Input className="admin-form-input" value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="user@example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пароль</Typography.Body>
              <Input className="admin-form-input" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ width: "100%" }} />
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>Оставьте пустым, чтобы не менять</Typography.Body>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (email)</Typography.Body>
              <Input className="admin-form-input" type="email" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="noreply@haulz.ru" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (имя)</Typography.Body>
              <Input className="admin-form-input" value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="HAULZ" style={{ width: "100%" }} />
            </div>
            <Flex gap="0.5rem" style={{ flexWrap: "wrap" }}>
              <Button type="submit" className="filter-button" disabled={emailSaving}>
                {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
              </Button>
              <Button
                type="button"
                className="filter-button"
                disabled={emailTestLoading || !emailHost.trim()}
                onClick={async () => {
                  setEmailTestResult(null);
                  setEmailTestLoading(true);
                  try {
                    const res = await fetch("/api/admin-email-test", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                      },
                      body: JSON.stringify({
                        smtp_host: emailHost.trim(),
                        smtp_port: emailPort ? parseInt(emailPort, 10) : 587,
                        smtp_user: emailUser.trim() || undefined,
                        smtp_password: emailPassword.trim() || undefined,
                      }),
                    });
                    const data = await res.json();
                    setEmailTestResult({ ok: data.ok, message: data.message, error: data.error });
                  } catch (e: unknown) {
                    setEmailTestResult({ ok: false, error: (e as Error).message || "Ошибка запроса" });
                  } finally {
                    setEmailTestLoading(false);
                  }
                }}
              >
                {emailTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Тест"}
              </Button>
            </Flex>
            {emailTestResult && (
              <Typography.Body
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.9rem",
                  color: emailTestResult.ok ? "var(--color-success-status)" : "var(--color-error)",
                }}
              >
                {emailTestResult.ok ? "✓ " + (emailTestResult.message || "Подключение успешно") : "✗ " + (emailTestResult.error || "Ошибка")}
              </Typography.Body>
            )}

            <div className="admin-form-section" style={{ marginTop: "1.5rem" }}>
              <div className="admin-form-section-header">Поля в письмах</div>
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Что отправляется при регистрации и при сбросе пароля (тема письма: «Регистрация в HAULZ»):
              </Typography.Body>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>
                <li><strong>При регистрации:</strong> логин (email), пароль, название компании</li>
                <li><strong>При сбросе пароля:</strong> логин (email), новый временный пароль, название компании</li>
              </ul>
            </div>
          </form>
        </Panel>
      )}

      <CustomerPickModal
        isOpen={customerPickModalOpen}
        onClose={() => setCustomerPickModalOpen(false)}
        onSelect={(c) => addSelectedCustomer(c)}
        fetchCustomers={fetchCustomersForModal}
      />
    </div>
  );
}
