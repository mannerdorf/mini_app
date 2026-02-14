import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Loader2, Plus, LogOut, Trash2, Eye, EyeOff, FileUp, Activity, Copy, Building2, History, Layers, ChevronDown, ChevronRight, ChevronUp, Mail } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { CustomerPickModal, type CustomerItem } from "../components/modals/CustomerPickModal";
import { useFocusTrap } from "../hooks/useFocusTrap";

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

/** Первая строка разделов: при активном — красная. Служебный режим = доступ ко всем заказчикам + служебный режим в одном. */
const PERMISSION_ROW1 = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "service_mode", label: "Служебный режим" },
  { key: "__financial__", label: "Фин. показатели" as const },
] as const;

/** Вторая строка разделов: при активном — синяя */
const PERMISSION_ROW2 = [
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
  { key: "chat", label: "Чат" },
] as const;

export type PermissionPreset = { id: string; label: string; permissions: Record<string, boolean>; financial: boolean; serviceMode: boolean };

/** Пресеты по умолчанию (если API недоступен или пусто) */
const DEFAULT_PRESETS: PermissionPreset[] = [
  { id: "manager", label: "Менеджер", permissions: { cms_access: false, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: true, service_mode: false }, financial: true, serviceMode: false },
  { id: "accountant", label: "Бухгалтерия", permissions: { cms_access: false, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: false, service_mode: false }, financial: true, serviceMode: false },
  { id: "service", label: "Служебный режим", permissions: { cms_access: true, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: true, service_mode: true }, financial: true, serviceMode: true },
  { id: "empty", label: "Пустой", permissions: { cms_access: false, cargo: false, doc_invoices: false, doc_acts: false, doc_orders: false, doc_claims: false, doc_contracts: false, doc_acts_settlement: false, doc_tariffs: false, chat: false, service_mode: false }, financial: false, serviceMode: false },
];

/** Подсветка совпадения с поисковым запросом в тексте (для журнала аудита). */
function highlightMatch(text: string, query: string, keyPrefix: string): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  const parts = String(text).split(re);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={`${keyPrefix}-${i}`} style={{ background: "rgba(0, 113, 227, 0.25)", borderRadius: 2, padding: "0 1px" }}>{p}</mark> : p))}
    </>
  );
}

const WEAK_PASSWORDS = new Set(["123", "1234", "12345", "123456", "1234567", "12345678", "password", "qwerty", "admin", "letmein"]);
function isPasswordStrongEnough(p: string): { ok: boolean; message?: string } {
  if (p.length < 8) return { ok: false, message: "Минимум 8 символов" };
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return { ok: false, message: "Пароль слишком простой" };
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit = /\d/.test(p);
  if (!hasLetter || !hasDigit) return { ok: false, message: "Нужны буквы и цифры" };
  return { ok: true };
}

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
  last_login_at?: string | null;
  companies?: { inn: string; name: string }[];
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
      role="button"
      tabIndex={0}
      onClick={() => onEditPermissions(user)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditPermissions(user); } }}
      style={{
        padding: "0.75rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: user.active ? "var(--color-bg-hover)" : "var(--color-bg-input)",
        opacity: user.active ? 1 : 0.85,
        cursor: "pointer",
      }}
    >
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="0.5rem">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Body style={{ fontWeight: 600 }}>{user.login ?? "—"}</Typography.Body>
          {user.created_at && (
            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              {new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
            </Typography.Body>
          )}
        </div>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Профиль</Typography.Body>
          <span style={{ cursor: loading ? "wait" : "pointer" }}>
            <TapSwitch checked={user.active} onToggle={handleToggle} />
          </span>
        </Flex>
      </Flex>
    </div>
  );
}

export function AdminPage({ adminToken, onBack, onLogout }: AdminPageProps) {
  const USERS_PAGE_SIZE = 50;
  const [tab, setTab] = useState<"users" | "add" | "batch" | "templates" | "customers" | "audit" | "presets">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [lastLoginAvailable, setLastLoginAvailable] = useState(true);
  const [topActiveExpanded, setTopActiveExpanded] = useState(false);
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [usersViewMode, setUsersViewMode] = useState<"login" | "customer">("login");
  /** В режиме «По заказчикам» — какие группы развёрнуты (показаны логины) */
  const [expandedCustomerLabels, setExpandedCustomerLabels] = useState<Set<string>>(new Set());
  const [usersSortBy, setUsersSortBy] = useState<"email" | "date" | "active">("email");
  const [usersSortOrder, setUsersSortOrder] = useState<"asc" | "desc">("asc");
  const [usersFilterBy, setUsersFilterBy] = useState<"all" | "cms" | "no_cms" | "service_mode">("all");
  const [usersFilterLastLogin, setUsersFilterLastLogin] = useState<"all" | "7d" | "30d" | "never" | "old">("all");
  const [usersFilterPresetId, setUsersFilterPresetId] = useState<string>("");
  const [usersVisibleCount, setUsersVisibleCount] = useState(50);
  const [deactivateConfirmUserId, setDeactivateConfirmUserId] = useState<number | null>(null);
  const [bulkDeactivateConfirmOpen, setBulkDeactivateConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [bulkPermissions, setBulkPermissions] = useState<Record<string, boolean>>({
    cms_access: false, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: true, service_mode: false,
  });
  const [bulkFinancial, setBulkFinancial] = useState(false);
  const [bulkAccessAllInns, setBulkAccessAllInns] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSelectedPresetId, setBulkSelectedPresetId] = useState<string>("");
  const [customersList, setCustomersList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [customersSearch, setCustomersSearch] = useState("");
  const [customersShowOnlyWithoutEmail, setCustomersShowOnlyWithoutEmail] = useState(false);
  const [customersSortBy, setCustomersSortBy] = useState<"inn" | "customer_name" | "email">("customer_name");
  const [customersSortOrder, setCustomersSortOrder] = useState<"asc" | "desc">("asc");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<{ id: number; action: string; target_type: string; target_id: string | null; details: Record<string, unknown> | null; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilterAction, setAuditFilterAction] = useState<string>("");
  const [auditFilterTargetType, setAuditFilterTargetType] = useState<string>("");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [auditFetchTrigger, setAuditFetchTrigger] = useState(0);
  const [permissionPresets, setPermissionPresets] = useState<PermissionPreset[]>(DEFAULT_PRESETS);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetEditingId, setPresetEditingId] = useState<string | null>(null);
  const [presetFormLabel, setPresetFormLabel] = useState("");
  const [presetFormPermissions, setPresetFormPermissions] = useState<Record<string, boolean>>({
    cms_access: false, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: true, service_mode: false,
  });
  const [presetFormFinancial, setPresetFormFinancial] = useState(false);
  const [presetFormServiceMode, setPresetFormServiceMode] = useState(false);
  const [presetFormError, setPresetFormError] = useState<string | null>(null);
  const [presetFormSaving, setPresetFormSaving] = useState(false);
  const [presetDeleteConfirmId, setPresetDeleteConfirmId] = useState<string | null>(null);
  const [presetDeleteLoading, setPresetDeleteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [editorChangeLoginValue, setEditorChangeLoginValue] = useState("");
  const [editorChangeLoginOpen, setEditorChangeLoginOpen] = useState(false);
  const [editorChangeLoginLoading, setEditorChangeLoginLoading] = useState(false);
  const [deleteProfileConfirmOpen, setDeleteProfileConfirmOpen] = useState(false);
  const [deleteProfileLoading, setDeleteProfileLoading] = useState(false);

  const deactivateModalRef = useRef<HTMLDivElement>(null);
  const bulkDeactivateModalRef = useRef<HTMLDivElement>(null);
  const presetDeleteModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(deactivateModalRef, deactivateConfirmUserId != null, () => setDeactivateConfirmUserId(null));
  useFocusTrap(bulkDeactivateModalRef, bulkDeactivateConfirmOpen, () => !bulkLoading && setBulkDeactivateConfirmOpen(false));
  useFocusTrap(presetDeleteModalRef, presetDeleteConfirmId != null, () => !presetDeleteLoading && setPresetDeleteConfirmId(null));

  const [formAccessAllInns, setFormAccessAllInns] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerItem[]>([]);
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({
    cms_access: false,
    cargo: true,
    doc_invoices: true,
    doc_acts: true,
    doc_orders: true,
    doc_claims: true,
    doc_contracts: true,
    doc_acts_settlement: true,
    doc_tariffs: true,
    chat: true,
    service_mode: false,
  });
  const [formSelectedPresetId, setFormSelectedPresetId] = useState<string>("");
  const [formFinancial, setFormFinancial] = useState(false);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);
  const [batchEntries, setBatchEntries] = useState<{ login: string; password: string; inn?: string; customer?: string }[]>([]);
  const isInnLike = (s: string) => /^\d{10,12}$/.test(String(s).trim());
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [emailTemplateRegistration, setEmailTemplateRegistration] = useState("");
  const [emailTemplatePasswordReset, setEmailTemplatePasswordReset] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesSaving, setTemplatesSaving] = useState(false);

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
  const [customerDirectoryMap, setCustomerDirectoryMap] = useState<Record<string, string>>({});

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
      setLastLoginAvailable(data.last_login_available !== false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onLogout]);

  useEffect(() => {
    if (tab !== "users") return;
    fetch(`/api/admin-customers-search?q=&limit=2000`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { customers?: { inn: string; customer_name: string }[] }) => {
        const map: Record<string, string> = {};
        for (const c of data.customers || []) {
          if (c.inn && c.customer_name) map[c.inn] = c.customer_name;
        }
        setCustomerDirectoryMap(map);
      })
      .catch(() => {});
  }, [tab, adminToken]);


  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-email-templates", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout?.("expired");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data?.error as string) || "Ошибка загрузки шаблонов");
        return;
      }
      setEmailTemplateRegistration(data.email_template_registration ?? "");
      setEmailTemplatePasswordReset(data.email_template_password_reset ?? "");
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки шаблонов");
    } finally {
      setTemplatesLoading(false);
    }
  }, [adminToken, onLogout]);

  useEffect(() => {
    if (tab === "users") fetchUsers();
    if (tab === "templates") fetchTemplates();
  }, [tab, fetchUsers, fetchTemplates]);

  const handleSaveTemplates = async (e: React.FormEvent) => {
    e.preventDefault();
    setTemplatesSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-email-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email_template_registration: emailTemplateRegistration.trim(),
          email_template_password_reset: emailTemplatePasswordReset.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка сохранения");
      await fetchTemplates();
    } catch (e: unknown) {
      setError((e as Error)?.message);
    } finally {
      setTemplatesSaving(false);
    }
  };

  const matchesUserSearch = useCallback((u: User, q: string) => {
    if (!q) return true;
    const ql = q.trim().toLowerCase();
    if (!ql) return true;
    if (u.login && String(u.login).toLowerCase().includes(ql)) return true;
    const searchIn = [...(u.companies ?? []).flatMap((c) => [c.inn, c.name].filter(Boolean)), u.inn, u.company_name].map((s) => String(s).toLowerCase());
    return searchIn.some((s) => s.includes(ql));
  }, []);

  const userMatchesPreset = useCallback((u: User, preset: PermissionPreset) => {
    const perms = u.permissions ?? {};
    for (const { key } of PERMISSION_KEYS) {
      if (key === "__financial__" || key === "service_mode") continue;
      if (!!perms[key] !== !!preset.permissions[key]) return false;
    }
    if (!!u.financial_access !== !!preset.financial) return false;
    const userServiceMode = !!(u.permissions?.service_mode || u.access_all_inns);
    if (userServiceMode !== !!preset.serviceMode) return false;
    return true;
  }, []);

  const now = Date.now();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  const usersFilterCounts = useMemo(() => {
    const q = usersSearchQuery.trim();
    const base = users.filter((u) => matchesUserSearch(u, q));
    const withLastLogin = (pred: (u: User) => boolean) => base.filter(pred).length;
    return {
      all: base.length,
      cms: base.filter((u) => !!u.permissions?.cms_access).length,
      no_cms: base.filter((u) => !u.permissions?.cms_access).length,
      service_mode: base.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns).length,
      last_login_7d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms7d),
      last_login_30d: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() <= ms30d),
      last_login_never: withLastLogin((u) => u.last_login_at == null),
      last_login_old: withLastLogin((u) => u.last_login_at != null && now - new Date(u.last_login_at).getTime() > ms30d),
      preset: (presetId: string) => {
        const preset = permissionPresets.find((p) => p.id === presetId);
        if (!preset) return 0;
        return base.filter((u) => userMatchesPreset(u, preset)).length;
      },
    };
  }, [users, usersSearchQuery, matchesUserSearch, permissionPresets, userMatchesPreset]);

  const topActiveUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.active)
      .sort((a, b) => {
        const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        return bt - at;
      })
      .slice(0, 15)
      .map((u) => ({ id: u.id, login: u.login, company_name: u.company_name ?? "", last_login_at: u.last_login_at ?? null }));
  }, [users]);

  useEffect(() => {
    setUsersVisibleCount(USERS_PAGE_SIZE);
  }, [usersSearchQuery, usersFilterBy, usersFilterLastLogin, usersFilterPresetId]);

  useEffect(() => {
    if (tab !== "audit") return;
    setAuditLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (auditSearch.trim()) params.set("q", auditSearch.trim());
    if (auditFilterAction) params.set("action", auditFilterAction);
    if (auditFilterTargetType) params.set("target_type", auditFilterTargetType);
    if (auditFromDate) params.set("from", auditFromDate);
    if (auditToDate) params.set("to", auditToDate);
    fetch(`/api/admin-audit-log?${params.toString()}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { entries?: typeof auditEntries } ) => setAuditEntries(data.entries || []))
      .catch(() => setAuditEntries([]))
      .finally(() => setAuditLoading(false));
  }, [tab, adminToken, auditFetchTrigger]);

  useEffect(() => {
    if (tab !== "customers") return;
    setCustomersLoading(true);
    const query = customersSearch.trim();
    const url = query.length >= 2
      ? `/api/admin-customers-search?q=${encodeURIComponent(query)}&limit=500`
      : `/api/admin-customers-search?q=&limit=2000`;
    fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { customers?: { inn: string; customer_name: string; email: string }[] }) => {
        setCustomersList(data.customers || []);
      })
      .catch(() => setCustomersList([]))
      .finally(() => setCustomersLoading(false));
  }, [tab, customersSearch, adminToken]);

  const fetchPresets = useCallback(() => {
    setPresetsLoading(true);
    fetch("/api/admin-presets", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { presets?: PermissionPreset[] }) => {
        if (Array.isArray(data.presets) && data.presets.length > 0) {
          setPermissionPresets(data.presets);
        }
      })
      .catch(() => {})
      .finally(() => setPresetsLoading(false));
  }, [adminToken]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  useEffect(() => {
    if (!adminToken) return;
    fetch("/api/admin-me", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { isSuperAdmin?: boolean }) => setIsSuperAdmin(data?.isSuperAdmin === true))
      .catch(() => {});
  }, [adminToken]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormResult(null);
    setError(null);
    if (!formAccessAllInns && !formPermissions.service_mode && selectedCustomers.length === 0) {
      setError("Выберите заказчика из справочника или включите служебный режим");
      setFormSubmitting(false);
      return;
    }
    if (!formSendEmail && !formPassword) {
      setError("Введите пароль вручную или включите отправку на email");
      setFormSubmitting(false);
      return;
    }
    if (!formSendEmail) {
      const strong = isPasswordStrongEnough(formPassword);
      if (!strong.ok) {
        setError(strong.message || "Пароль слишком простой. Минимум 8 символов, буквы и цифры.");
        setFormSubmitting(false);
        return;
      }
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

  const togglePerm = (key: string) => {
    setFormSelectedPresetId("");
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
      const parts = line.split(/[/\t,;]/).map((p) => p.trim());
      if (parts.length < 2) {
        errors.push(`Строка "${line}" пропущена — формат: login, password [, ИНН или заказчик [, название]]`);
        continue;
      }
      const third = parts[2] || "";
      const fourth = parts[3] || "";
      if (isInnLike(third)) {
        entries.push({ login: parts[0], password: parts[1], inn: third, customer: fourth || undefined });
      } else {
        entries.push({ login: parts[0], password: parts[1], customer: third || undefined });
      }
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

  const handleDownloadBatchTemplate = async () => {
    try {
      const XLSX = await loadXlsxLibrary();
      const rows = [
        ["Логин (email)", "Пароль", "ИНН", "Название компании"],
        ["example@mail.ru", "Пароль123", "7733751177", "ООО Пример"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Пользователи");
      XLSX.writeFile(wb, "шаблон_массовая_регистрация.xlsx");
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки шаблона");
    }
  };

  const parseExcelEntries = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const XLSX = await loadXlsxLibrary();
    const workbook = XLSX.read(new Uint8Array(bytes), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    const entries: typeof batchEntries = [];
    const errors: string[] = [];
    for (const row of matrix) {
      const cells = row.map((cell) => (typeof cell === "string" ? cell.trim() : String(cell ?? "").trim()));
      const [login, password, col3, col4] = cells;
      if (!login || !password) {
        if (login || password) errors.push(`Пропущена строка — укажите login и password`);
        continue;
      }
      if (isInnLike(col3 || "")) {
        entries.push({ login, password, inn: col3, customer: col4 || undefined });
      } else {
        entries.push({ login, password, customer: col3 || undefined });
      }
    }
    return { entries, errors };
  };

  const handleBatchFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBatchError(null);
    setBatchSuccess(null);
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

  const registerEntry = async (entry: { login: string; password: string; inn?: string; customer?: string }) => {
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
    } else if (entry.inn) {
      payload.customers = [{ inn: entry.inn, name: entry.customer || entry.inn }];
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
      const res = await fetch("/api/admin-users", { headers: { Authorization: `Bearer ${adminToken}` } });
      const data = await res.json().catch(() => ({}));
      const existingLogins = new Set((data.users || []).map((u: User) => (u.login || "").trim().toLowerCase()));
      const duplicates = batchEntries.filter((e) => existingLogins.has((e.login || "").trim().toLowerCase()));
      const toRegister = duplicates.length > 0
        ? batchEntries.filter((e) => !existingLogins.has((e.login || "").trim().toLowerCase()))
        : batchEntries;
      if (duplicates.length > 0 && toRegister.length > 0) {
        const msg = `Уже зарегистрированы (${duplicates.length}): ${duplicates.slice(0, 5).map((d) => d.login).join(", ")}${duplicates.length > 5 ? "…" : ""}. Регистрировать только новых (${toRegister.length})?`;
        if (!window.confirm(msg)) {
          setBatchLoading(false);
          return;
        }
      } else if (duplicates.length > 0 && toRegister.length === 0) {
        setBatchError(`Все ${duplicates.length} логинов уже зарегистрированы.`);
        setBatchLoading(false);
        return;
      }
      let ok = 0;
      const failed: { login: string; error: string }[] = [];
      for (const entry of toRegister) {
        try {
          await registerEntry(entry);
          ok += 1;
        } catch (e: unknown) {
          failed.push({ login: entry.login, error: (e as Error)?.message || "Ошибка" });
        }
      }
      setBatchEntries([]);
      if (failed.length === 0) {
        setBatchSuccess(`Зарегистрировано пользователей: ${ok}`);
        setBatchError(null);
      } else {
        setBatchSuccess(null);
        const first = failed.slice(0, 5).map((f) => `${f.login}: ${f.error}`).join("; ");
        setBatchError(`Зарегистрировано: ${ok}. Не удалось: ${failed.length}. Примеры: ${first}`);
      }
      await fetchUsers();
    } catch (e: unknown) {
      setBatchError((e as Error)?.message || "Ошибка пакетной регистрации");
    } finally {
      setBatchLoading(false);
    }
  };

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
    setEditorSelectedPresetId("");
    setEditorPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const toggleSelectUser = useCallback((id: number) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedUserIds([]);
    setBulkSelectedPresetId("");
  }, []);

  const handleBulkApplyPermissions = useCallback(async () => {
    if (selectedUserIds.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    const body = {
      permissions: bulkPermissions,
      financial_access: bulkFinancial,
      access_all_inns: bulkAccessAllInns,
    };
    const failed: { id: number; error: string }[] = [];
    for (const id of selectedUserIds) {
      try {
        const res = await fetch(`/api/admin-user-update?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) failed.push({ id, error: (data?.error as string) || "Ошибка" });
      } catch {
        failed.push({ id, error: "Ошибка запроса" });
      }
    }
    await fetchUsers();
    setBulkLoading(false);
    if (failed.length > 0) {
      setBulkError(`Не удалось применить к ${failed.length}: ${failed.slice(0, 3).map((f) => f.id).join(", ")}${failed.length > 3 ? "…" : ""}`);
    } else {
      setSelectedUserIds([]);
    }
  }, [selectedUserIds, bulkPermissions, bulkFinancial, bulkAccessAllInns, adminToken]);

  const handleBulkDeactivate = useCallback(async () => {
    if (selectedUserIds.length === 0) return;
    setBulkDeactivateConfirmOpen(false);
    setBulkLoading(true);
    setBulkError(null);
    const failed: { id: number; error: string }[] = [];
    for (const id of selectedUserIds) {
      try {
        const res = await fetch(`/api/admin-user-update?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ active: false }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) failed.push({ id, error: (data?.error as string) || "Ошибка" });
      } catch {
        failed.push({ id, error: "Ошибка запроса" });
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
  }, [selectedUserIds, adminToken, fetchUsers]);

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
          customers: editorCustomers.map((c) => ({ inn: c.inn, name: c.customer_name })),
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
        body: JSON.stringify({ reset_password: true, send_password_to_email: editorSendPasswordToEmail }),
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
    setEditorAccessAllInns(Boolean(selectedUser.permissions?.service_mode ?? selectedUser.access_all_inns));
    const list = selectedUser.companies?.length
      ? selectedUser.companies.map((c) => ({ inn: c.inn, customer_name: c.name || "", email: "" }))
      : selectedUser.inn
        ? [{ inn: selectedUser.inn, customer_name: selectedUser.company_name || "", email: "" }]
        : [];
    setEditorCustomers(list);
    setEditorError(null);
    fetch(`/api/admin-customers-search?q=&limit=2000`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { customers?: { inn: string; customer_name: string }[] }) => {
        const map: Record<string, string> = {};
        for (const c of data.customers || []) {
          if (c.inn && c.customer_name) map[c.inn] = c.customer_name;
        }
        setCustomerDirectoryMap(map);
      })
      .catch(() => setCustomerDirectoryMap({}));
  }, [selectedUser, adminToken]);
  useEffect(() => {
    if (!selectedUser) setResetPasswordInfo(null);
  }, [selectedUser]);

  return (
    <div className="w-full">
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.75rem">
          <Button type="button" className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад в приложение">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
        </Flex>
        {onLogout && (
          <Button type="button" className="filter-button" onClick={onLogout} style={{ padding: "0.5rem 0.75rem" }} aria-label="Выйти из админки">
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
          style={{ background: tab === "templates" ? "var(--color-primary-blue)" : undefined, color: tab === "templates" ? "white" : undefined }}
          onClick={() => setTab("templates")}
        >
          <Mail className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Шаблоны писем
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "customers" ? "var(--color-primary-blue)" : undefined, color: tab === "customers" ? "white" : undefined }}
          onClick={() => setTab("customers")}
        >
          <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Справочник заказчиков
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "audit" ? "var(--color-primary-blue)" : undefined, color: tab === "audit" ? "white" : undefined }}
          onClick={() => setTab("audit")}
        >
          <History className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Журнал
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "presets" ? "var(--color-primary-blue)" : undefined, color: tab === "presets" ? "white" : undefined }}
          onClick={() => setTab("presets")}
        >
          <Layers className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Пресеты ролей
        </Button>
      </Flex>

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</Typography.Body>
      )}

      {tab === "users" && (
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
                          const res = await fetch(`/api/admin-user-update?id=${u.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                            body: JSON.stringify({ active: false }),
                          });
                          if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Ошибка");
                          setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: false } : x)));
                        } catch (e: unknown) {
                          setError((e as Error)?.message || "Ошибка обновления");
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
                {!lastLoginAvailable && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-error)", marginBottom: "0.5rem" }}>
                    Колонка last_login_at отсутствует в БД. Выполните миграцию 015 (migrations/015_registered_users_last_login.sql) — тогда время входа будет сохраняться при входе по email/пароль.
                  </Typography.Body>
                )}
                {lastLoginAvailable && topActiveUsers.length > 0 && topActiveUsers.every((u) => !u.last_login_at) && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    Даты появятся после того, как пользователи войдут в приложение по email и паролю.
                  </Typography.Body>
                )}
                {loading ? (
                  <Flex align="center" gap="0.5rem">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка...</Typography.Body>
                  </Flex>
                ) : topActiveUsers.length === 0 ? (
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Нет активных пользователей. Данные о входах появятся после входа через CMS.</Typography.Body>
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
                          gap: "0.75rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{i + 1}. {u.login}</span>
                        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginLeft: "0.5rem" }}>
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
              </>
            )}
          </Panel>

          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
            <Flex className="admin-users-toolbar" gap="0.75rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
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
              <label htmlFor="admin-users-search" className="visually-hidden">Поиск по email или заказчику</label>
              <Input
                id="admin-users-search"
                type="text"
                placeholder="Поиск по email или заказчику (ИНН / название)"
                value={usersSearchQuery}
                onChange={(e) => setUsersSearchQuery(e.target.value)}
                className="admin-form-input"
                style={{ maxWidth: "24rem" }}
                aria-label="Поиск по email или заказчику (ИНН / название)"
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
              <Button
                type="button"
                className="filter-button"
                onClick={() => {
                  const q = usersSearchQuery.trim();
                  let list = users.filter((u) => matchesUserSearch(u, q));
                  if (usersFilterBy === "cms") list = list.filter((u) => !!u.permissions?.cms_access);
                  else if (usersFilterBy === "no_cms") list = list.filter((u) => !u.permissions?.cms_access);
                  else if (usersFilterBy === "service_mode") list = list.filter((u) => !!u.permissions?.service_mode || !!u.access_all_inns);
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
                    return [u.login, customers, perms, u.active ? "да" : "нет", u.created_at ? new Date(u.created_at).toLocaleDateString("ru-RU") : ""];
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
                        Удалить профиль
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
                              const res = await fetch(`/api/admin-user-update?id=${selectedUser.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                body: JSON.stringify({ login: newLogin }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data?.error || "Ошибка");
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
                        <Typography.Body id="delete-profile-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Удалить профиль?</Typography.Body>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                          Пользователь {selectedUser.login} будет удалён из системы без возможности восстановления. Запись в registered_users и привязки заказчиков удалятся.
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
                                const res = await fetch(`/api/admin-user-update?id=${selectedUser.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                  body: JSON.stringify({ delete_profile: true }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data?.error || "Ошибка удаления");
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
                            {deleteProfileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
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
                            setEditorPermissions(preset.permissions);
                            setEditorFinancial(preset.financial);
                            setEditorAccessAllInns(preset.serviceMode);
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
                    <div className="admin-permissions-toolbar">
                      {PERMISSION_ROW1.map(({ key, label }) => {
                        const isActive = key === "__financial__" ? editorFinancial : key === "service_mode" ? (!!editorPermissions.service_mode || editorAccessAllInns) : !!editorPermissions[key];
                        const onClick = key === "__financial__" ? () => { setEditorSelectedPresetId(""); setEditorFinancial(!editorFinancial); } : key === "service_mode" ? () => { setEditorSelectedPresetId(""); const v = !(!!editorPermissions.service_mode || editorAccessAllInns); setEditorPermissions((p) => ({ ...p, service_mode: v })); setEditorAccessAllInns(v); } : () => handlePermissionsToggle(key);
                        return (
                          <button key={key} type="button" className={`permission-button ${isActive ? "active active-danger" : ""}`} onClick={onClick}>{label}</button>
                        );
                      })}
                    </div>
                    <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                      {PERMISSION_ROW2.map(({ key, label }) => {
                        const isActive = !!editorPermissions[key];
                        return (
                          <button key={key} type="button" className={`permission-button ${isActive ? "active" : ""}`} onClick={() => handlePermissionsToggle(key)}>{label}</button>
                        );
                      })}
                    </div>
                  </div>
                  {!(editorPermissions.service_mode || editorAccessAllInns) && (
                    <div style={{ marginBottom: "1rem" }}>
                      <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div
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
                          }}
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
                                  onClick={() => setEditorCustomers((prev) => prev.filter((c) => c.inn !== cust.inn))}
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
                  const res = await fetch(`/api/admin-user-update?id=${u.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({ active: next }),
                  });
                  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Ошибка");
                  setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: next } : x)));
                  setDeactivateConfirmUserId(null);
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка обновления");
                }
              };
              const selectAllOnPage = () => setSelectedUserIds((prev) => { const s = new Set(prev); visibleSorted.forEach((u) => s.add(u.id)); return [...s]; });
              const renderUserBlock = (u: User) => (
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
                    <UserRow
                      user={u}
                      adminToken={adminToken}
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
                          setBulkPermissions(preset.permissions);
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
                  <div className="admin-permissions-toolbar">
                    {PERMISSION_ROW1.map(({ key, label }) => {
                      const isActive = key === "__financial__" ? bulkFinancial : key === "service_mode" ? (!!bulkPermissions.service_mode || bulkAccessAllInns) : !!bulkPermissions[key];
                      const onClick = key === "__financial__" ? () => { setBulkSelectedPresetId(""); setBulkFinancial(!bulkFinancial); } : key === "service_mode" ? () => { setBulkSelectedPresetId(""); const v = !(!!bulkPermissions.service_mode || bulkAccessAllInns); setBulkPermissions((p) => ({ ...p, service_mode: v })); setBulkAccessAllInns(v); } : () => { setBulkSelectedPresetId(""); setBulkPermissions((p) => ({ ...p, [key]: !p[key] })); };
                      return <button key={key} type="button" className={`permission-button ${isActive ? "active active-danger" : ""}`} onClick={onClick}>{label}</button>;
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                    {PERMISSION_ROW2.map(({ key, label }) => (
                      <button key={key} type="button" className={`permission-button ${!!bulkPermissions[key] ? "active" : ""}`} onClick={() => { setBulkSelectedPresetId(""); setBulkPermissions((p) => ({ ...p, [key]: !p[key] })); }}>{label}</button>
                    ))}
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
                      <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                      {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                    </Flex>
                    {bulkPanel}
                    {visibleSorted.length === 0 ? (
                      <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пользователей по запросу</Typography.Body>
                    ) : (
                      visibleSorted.map((u) => renderUserBlock(u))
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
              const addToGroup = (label: string, user: User) => {
                const list = groups.get(label) ?? [];
                if (!list.some((x) => x.id === user.id)) list.push(user);
                groups.set(label, list);
              };
              for (const u of visibleSorted) {
                if (u.access_all_inns && (!u.companies || u.companies.length === 0)) {
                  addToGroup(CUSTOMER_ALL, u);
                  continue;
                }
                if (u.companies && u.companies.length > 0) {
                  for (const c of u.companies) {
                    const label = c.name?.trim() ? `${c.name} (${c.inn})` : c.inn;
                    addToGroup(label, u);
                  }
                } else if (u.inn) {
                  const label = u.company_name?.trim() ? `${u.company_name} (${u.inn})` : u.inn;
                  addToGroup(label, u);
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
                    <Button type="button" className="filter-button" onClick={clearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
                    {selectedUserIds.length > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedUserIds.length}</Typography.Body>}
                  </Flex>
                  {bulkPanel}
                  {sortedLabels.length === 0 ? (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пользователей по запросу</Typography.Body>
                  ) : (
                    sortedLabels.map((label) => {
                      const groupUsers = groups.get(label) ?? [];
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
                              padding: "0.75rem",
                              border: "1px solid var(--color-border)",
                              borderRadius: "8px",
                              background: "var(--color-bg-hover)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "0.5rem",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Typography.Body style={{ fontWeight: 600 }}>{groupDisplayName(label)}</Typography.Body>
                              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>
                                {groupUsers.length} {groupUsers.length === 1 ? "логин" : groupUsers.length < 5 ? "логина" : "логинов"}
                              </Typography.Body>
                            </div>
                            {isExpanded ? <ChevronDown size={20} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} /> : <ChevronRight size={20} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />}
                          </div>
                          {isExpanded && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingLeft: "0.5rem" }}>
                              {groupUsers.map((u) => renderUserBlock(u))}
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
      )}

      {tab === "batch" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <div className="admin-form-section" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="admin-form-section-header">Массовая регистрация</div>
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              Файл: столбцы <strong>логин (email)</strong>, <strong>пароль</strong>, <strong>ИНН</strong> (10–12 цифр) или название заказчика, при необходимости 4-й столбец — название компании.
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
              Если в файле нет ИНН (только названия в 3-м столбце), отметьте «Доступ ко всем заказчикам» ниже.
            </Typography.Body>
            <Button type="button" className="filter-button" onClick={handleDownloadBatchTemplate} style={{ alignSelf: "flex-start" }}>
              Скачать шаблон .xlsx
            </Button>
            <Flex align="center" gap="0.5rem" style={{ marginTop: "0.25rem" }}>
              <input
                type="checkbox"
                id="batch-access-all-inns"
                checked={formAccessAllInns}
                onChange={(e) => setFormAccessAllInns(e.target.checked)}
              />
              <label htmlFor="batch-access-all-inns" style={{ fontSize: "0.9rem", cursor: "pointer" }}>
                Служебный режим (для всех из файла)
              </label>
            </Flex>
            <div className="admin-file-input-wrap">
              <label htmlFor="batch-file" className="visually-hidden">Файл с пользователями (TXT, CSV, XLS, XLSX)</label>
              <Input id="batch-file" className="admin-form-input admin-file-input" type="file" accept=".txt,.csv,.xls,.xlsx" onChange={handleBatchFile} aria-label="Файл с пользователями" />
            </div>
            {batchEntries.length > 0 && (
              <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                Загружено записей: {batchEntries.length}
              </Typography.Body>
            )}
            {batchSuccess && (
              <Typography.Body style={{ color: "var(--color-success-status, #22c55e)", fontSize: "0.85rem" }}>{batchSuccess}</Typography.Body>
            )}
            {batchError && (
              <>
                <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem" }}>{batchError}</Typography.Body>
                {batchError.includes("ИНН обязателен") && (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                    Включите «Служебный режим» выше или укажите ИНН (10–12 цифр) в 3-м столбце файла.
                  </Typography.Body>
                )}
              </>
            )}
            <Button className="filter-button" type="button" disabled={batchLoading || batchEntries.length === 0} onClick={handleBatchRegister}>
              {batchLoading ? "Регистрируем…" : "Зарегистрировать из файла"}
            </Button>
          </div>
        </Panel>
      )}

      {tab === "add" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <form onSubmit={handleAddUser}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
              {(formAccessAllInns || formPermissions.service_mode) ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Служебный режим — выбор заказчика не требуется</Typography.Body>
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
            <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
              <label htmlFor="form-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Email</label>
              <Input id="form-email" className="admin-form-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
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
                      setFormPermissions(preset.permissions);
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
              <div className="admin-permissions-toolbar">
                {PERMISSION_ROW1.map(({ key, label }) => {
                  const isActive = key === "__financial__" ? formFinancial : key === "service_mode" ? (!!formPermissions.service_mode || formAccessAllInns) : !!formPermissions[key];
                  const onClick = key === "__financial__" ? () => { setFormSelectedPresetId(""); setFormFinancial(!formFinancial); } : key === "service_mode" ? () => { setFormSelectedPresetId(""); const v = !(!!formPermissions.service_mode || formAccessAllInns); setFormPermissions((p) => ({ ...p, service_mode: v })); setFormAccessAllInns(v); if (v) clearCustomerSelection(); } : () => togglePerm(key);
                  return (
                    <button type="button" key={key} className={`permission-button ${isActive ? "active active-danger" : ""}`} onClick={onClick}>{label}</button>
                  );
                })}
              </div>
              <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                {PERMISSION_ROW2.map(({ key, label }) => {
                  const isActive = !!formPermissions[key];
                  return (
                    <button type="button" key={key} className={`permission-button ${isActive ? "active" : ""}`} onClick={() => togglePerm(key)}>{label}</button>
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
                    disabled={batchEntries.length > 0}
                    minLength={8}
                    autoComplete="new-password"
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
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                  Минимум 8 символов, обязательно буквы и цифры. Простые пароли (123, password и т.п.) запрещены.
                </Typography.Body>
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

      {tab === "templates" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Шаблоны писем</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            HTML-текст писем при регистрации и при сбросе пароля. Подстановки: <code>[login]</code>, <code>[email]</code>, <code>[password]</code>, <code>[company_name]</code>. Пусто — текст по умолчанию.
          </Typography.Body>
          {templatesLoading ? (
            <Flex align="center" gap="0.5rem" style={{ marginBottom: "1rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка…</Typography.Body>
            </Flex>
          ) : (
            <form onSubmit={handleSaveTemplates}>
              <label htmlFor="email-template-registration" style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Письмо при регистрации</label>
              <textarea
                id="email-template-registration"
                className="admin-form-input"
                value={emailTemplateRegistration}
                onChange={(e) => setEmailTemplateRegistration(e.target.value)}
                placeholder="Оставьте пустым для текста по умолчанию"
                rows={8}
                style={{ width: "100%", resize: "vertical", minHeight: "8rem", marginBottom: "1rem" }}
              />
              <label htmlFor="email-template-password-reset" style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Письмо при сбросе пароля</label>
              <textarea
                id="email-template-password-reset"
                className="admin-form-input"
                value={emailTemplatePasswordReset}
                onChange={(e) => setEmailTemplatePasswordReset(e.target.value)}
                placeholder="Оставьте пустым для текста по умолчанию"
                rows={8}
                style={{ width: "100%", resize: "vertical", minHeight: "8rem", marginBottom: "1rem" }}
              />
              <Button type="submit" className="filter-button" disabled={templatesSaving}>
                {templatesSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
              </Button>
            </form>
          )}
        </Panel>
      )}

      {tab === "customers" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник заказчиков</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Данные из кэша (cache_customers). Обновление по расписанию.
          </Typography.Body>
          <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
            <label htmlFor="customers-search" className="visually-hidden">Поиск заказчиков по ИНН или наименованию</label>
            <Input
              id="customers-search"
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={customersSearch}
              onChange={(e) => setCustomersSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "24rem" }}
              aria-label="Поиск по ИНН или наименованию"
            />
            <label htmlFor="customers-only-without-email" style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.9rem" }}>
              <input
                id="customers-only-without-email"
                type="checkbox"
                checked={customersShowOnlyWithoutEmail}
                onChange={(e) => setCustomersShowOnlyWithoutEmail(e.target.checked)}
              />
              <Typography.Body>Только без email</Typography.Body>
            </label>
          </Flex>
          {customersLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : customersList.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
              {customersSearch.trim().length >= 2 ? "Нет совпадений" : "Справочник пуст"}
            </Typography.Body>
          ) : (() => {
            const filtered = customersShowOnlyWithoutEmail
              ? customersList.filter((c) => !c.email || String(c.email).trim() === "")
              : customersList;
            const sorted = [...filtered].sort((a, b) => {
              const key = customersSortBy;
              const va = (key === "inn" ? a.inn : key === "customer_name" ? (a.customer_name || "") : (a.email || "")).toLowerCase();
              const vb = (key === "inn" ? b.inn : key === "customer_name" ? (b.customer_name || "") : (b.email || "")).toLowerCase();
              const cmp = va.localeCompare(vb, "ru");
              return customersSortOrder === "asc" ? cmp : -cmp;
            });
            const toggleSort = (col: "inn" | "customer_name" | "email") => {
              if (customersSortBy === col) setCustomersSortOrder((o) => (o === "asc" ? "desc" : "asc"));
              else { setCustomersSortBy(col); setCustomersSortOrder("asc"); }
            };
            const thStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
            const thClass = "sortable-th";
            return (
              <>
                <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={customersSortBy === "inn" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined}>
                          ИНН {customersSortBy === "inn" && (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />)}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("customer_name")} role="columnheader" aria-sort={customersSortBy === "customer_name" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined}>
                          Наименование {customersSortBy === "customer_name" && (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />)}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={customersSortBy === "email" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined}>
                          Email {customersSortBy === "email" && (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c) => (
                        <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{c.inn}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{c.customer_name || "—"}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
                  Записей: {sorted.length}{customersShowOnlyWithoutEmail && sorted.length !== customersList.length ? ` (из ${customersList.length})` : ""}
                </Typography.Body>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === "audit" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Журнал действий</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
            Регистрации и изменения прав пользователей, вход в админку, настройки почты, пресеты
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Поиск по действию, типу объекта, id, логину и деталям. Затем нажмите «Обновить».
          </Typography.Body>
          <Flex className="admin-audit-toolbar" wrap="wrap" align="center">
            <label htmlFor="audit-search" className="visually-hidden">Поиск по журналу</label>
            <Input
              id="audit-search"
              className="admin-form-input"
              placeholder="Поиск: действие, объект, логин, детали..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              style={{ width: "16rem", minWidth: "12rem" }}
              aria-label="Поиск по журналу: действие, объект, логин, детали"
            />
            <label htmlFor="audit-filter-action" className="visually-hidden">Действие</label>
            <select
              id="audit-filter-action"
              className="admin-form-input"
              value={auditFilterAction}
              onChange={(e) => setAuditFilterAction(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Фильтр по действию"
            >
              <option value="">Все действия</option>
              <option value="admin_login">Вход в админку</option>
              <option value="user_register">Регистрация</option>
              <option value="user_update">Изменение</option>
              <option value="email_settings_saved">Настройки почты</option>
              <option value="preset_created">Пресет создан</option>
              <option value="preset_updated">Пресет обновлён</option>
              <option value="preset_deleted">Пресет удалён</option>
              <option value="user_deleted">Профиль удалён</option>
            </select>
            <label htmlFor="audit-filter-type" className="visually-hidden">Тип объекта</label>
            <select
              id="audit-filter-type"
              className="admin-form-input"
              value={auditFilterTargetType}
              onChange={(e) => setAuditFilterTargetType(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Фильтр по типу объекта"
            >
              <option value="">Все типы</option>
              <option value="user">Пользователь</option>
              <option value="session">Сессия</option>
              <option value="settings">Настройки</option>
              <option value="preset">Пресет</option>
            </select>
            <label htmlFor="audit-from-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>С:</label>
            <input
              id="audit-from-date"
              type="date"
              className="admin-form-input"
              value={auditFromDate}
              onChange={(e) => setAuditFromDate(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Дата начала периода"
            />
            <label htmlFor="audit-to-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>По:</label>
            <input
              id="audit-to-date"
              type="date"
              className="admin-form-input"
              value={auditToDate}
              onChange={(e) => setAuditToDate(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Дата окончания периода"
            />
            <Button
              className="filter-button"
              style={{ background: "var(--color-primary-blue)", color: "white" }}
              onClick={() => setAuditFetchTrigger((t) => t + 1)}
              disabled={auditLoading}
            >
              {auditLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
            </Button>
            <Button
              className="filter-button"
              onClick={() => {
                const header = "Время;Действие;Объект;Детали\n";
                const escape = (s: string) => (s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s);
                const actionLabel = (a: string) =>
                  a === "admin_login" ? "Вход в админку" : a === "user_register" ? "Регистрация" : a === "user_update" ? "Изменение"
                    : a === "email_settings_saved" ? "Настройки почты" : a === "preset_created" ? "Пресет создан" : a === "preset_updated" ? "Пресет обновлён" : a === "preset_deleted" ? "Пресет удалён" : a === "user_deleted" ? "Профиль удалён" : a;
                const objCell = (e: (typeof auditEntries)[0]) =>
                  e.target_type === "user" && e.details && typeof e.details.login === "string" ? e.details.login : e.target_id ?? "—";
                const detailsCell = (e: (typeof auditEntries)[0]) =>
                  e.details && typeof e.details === "object" && Object.keys(e.details).filter((k) => k !== "login").length > 0
                    ? Object.entries(e.details)
                        .filter(([k]) => k !== "login")
                        .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`))
                        .join(", ")
                    : "—";
                const rows = auditEntries.map(
                  (e) =>
                    `${escape(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }))};${escape(actionLabel(e.action))};${escape(objCell(e))};${escape(detailsCell(e))}`
                );
                const csv = header + rows.join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              disabled={auditEntries.length === 0}
            >
              Экспорт CSV
            </Button>
          </Flex>
          {auditLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : auditEntries.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет записей или таблица журнала ещё не создана (миграция 017)</Typography.Body>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Время</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Действие</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Объект</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => {
                    const actionLabel = e.action === "admin_login" ? "Вход в админку" : e.action === "user_register" ? "Регистрация" : e.action === "user_update" ? "Изменение" : e.action === "email_settings_saved" ? "Настройки почты" : e.action === "preset_created" ? "Пресет создан" : e.action === "preset_updated" ? "Пресет обновлён" : e.action === "preset_deleted" ? "Пресет удалён" : e.action === "user_deleted" ? "Профиль удалён" : e.action;
                    const objCell = e.target_type === "user" && e.details && typeof e.details.login === "string" ? e.details.login : e.target_id ?? "—";
                    const detailsStr = e.details && typeof e.details === "object" && Object.keys(e.details).filter((k) => k !== "login").length > 0
                      ? Object.entries(e.details)
                          .filter(([k]) => k !== "login")
                          .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`))
                          .join(", ")
                      : "—";
                    const q = auditSearch.trim();
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                          {q ? highlightMatch(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }), q, `t-${e.id}`) : new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          {q ? highlightMatch(actionLabel, q, `a-${e.id}`) : actionLabel}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          {q ? highlightMatch(String(objCell), q, `o-${e.id}`) : objCell}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                          {q ? highlightMatch(detailsStr, q, `d-${e.id}`) : detailsStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "presets" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Пресеты ролей</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Настройте наборы прав для быстрой подстановки при выдаче прав пользователям и при групповом изменении.
          </Typography.Body>
          {presetsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : (
            <>
              <div style={{ marginBottom: "1.5rem" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  {presetEditingId ? "Редактировать пресет" : "Добавить пресет"}
                </Typography.Body>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--element-gap, 0.75rem)", maxWidth: "28rem" }}>
                  <div>
                    <label htmlFor="preset-label" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-primary)" }}>Название</label>
                    <Input
                      id="preset-label"
                      className="admin-form-input"
                      value={presetFormLabel}
                      onChange={(e) => setPresetFormLabel(e.target.value)}
                      placeholder="Например: Менеджер"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div className="admin-form-section-header">Разделы</div>
                  <div className="admin-permissions-toolbar">
                    {PERMISSION_ROW1.map(({ key, label }) => {
                      const isActive = key === "__financial__" ? presetFormFinancial : key === "service_mode" ? (!!presetFormPermissions.service_mode || presetFormServiceMode) : !!presetFormPermissions[key];
                      const onClick = key === "__financial__" ? () => setPresetFormFinancial(!presetFormFinancial) : key === "service_mode" ? () => { const v = !(!!presetFormPermissions.service_mode || presetFormServiceMode); setPresetFormPermissions((p) => ({ ...p, service_mode: v })); setPresetFormServiceMode(v); } : () => setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }));
                      return <button key={key} type="button" className={`permission-button ${isActive ? "active active-danger" : ""}`} onClick={onClick}>{label}</button>;
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.25rem" }}>
                    {PERMISSION_ROW2.map(({ key, label }) => (
                      <button key={key} type="button" className={`permission-button ${!!presetFormPermissions[key] ? "active" : ""}`} onClick={() => setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }))}>{label}</button>
                    ))}
                  </div>
                  {presetFormError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{presetFormError}</Typography.Body>}
                  <Flex gap="0.5rem" style={{ marginTop: "0.5rem" }}>
                    <Button
                      type="button"
                      className="button-primary"
                      disabled={presetFormSaving || !presetFormLabel.trim()}
                      onClick={async () => {
                        setPresetFormError(null);
                        setPresetFormSaving(true);
                        try {
                          const res = await fetch("/api/admin-presets", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                            body: JSON.stringify({
                              ...(presetEditingId ? { id: presetEditingId } : {}),
                              label: presetFormLabel.trim(),
                              permissions: presetFormPermissions,
                              financial: presetFormFinancial,
                              serviceMode: presetFormServiceMode,
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка сохранения");
                          setPresetFormLabel("");
                          setPresetFormPermissions({ cms_access: false, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, chat: true, service_mode: false });
                          setPresetFormFinancial(false);
                          setPresetFormServiceMode(false);
                          setPresetEditingId(null);
                          fetchPresets();
                        } catch (e: unknown) {
                          setPresetFormError((e as Error)?.message || "Ошибка");
                        } finally {
                          setPresetFormSaving(false);
                        }
                      }}
                    >
                      {presetFormSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {presetFormSaving ? " Сохранение…" : presetEditingId ? "Сохранить" : "Добавить"}
                    </Button>
                    {presetEditingId && (
                      <Button className="filter-button" onClick={() => { setPresetEditingId(null); setPresetFormLabel(""); setPresetFormError(null); }}>
                        Отмена
                      </Button>
                    )}
                  </Flex>
                </div>
              </div>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>Список пресетов</Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {permissionPresets.length === 0 ? (
                  <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пресетов. Добавьте первый выше.</Typography.Body>
                ) : (
                  permissionPresets.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.75rem",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        background: "var(--color-bg-hover)",
                      }}
                    >
                      <Typography.Body style={{ fontWeight: 600 }}>{p.label}</Typography.Body>
                      <Flex gap="0.5rem">
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ padding: "0.35rem 0.6rem" }}
                          onClick={() => {
                            setPresetEditingId(p.id);
                            setPresetFormLabel(p.label);
                            setPresetFormPermissions({ ...p.permissions });
                            setPresetFormFinancial(p.financial);
                            setPresetFormServiceMode(p.serviceMode);
                            setPresetFormError(null);
                          }}
                        >
                          Изменить
                        </Button>
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ padding: "0.35rem 0.6rem", color: "var(--color-error)" }}
                          onClick={() => setPresetDeleteConfirmId(p.id)}
                        >
                          Удалить
                        </Button>
                      </Flex>
                    </div>
                  ))
                )}
              </div>
              {presetDeleteConfirmId && (
                <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !presetDeleteLoading && setPresetDeleteConfirmId(null)} role="dialog" aria-modal="true" aria-labelledby="preset-delete-title">
                  <div
                    ref={presetDeleteModalRef}
                    className="modal-content"
                    style={{ maxWidth: "20rem", padding: "1.25rem" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Typography.Body id="preset-delete-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Удалить пресет?</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                      Пресет «{permissionPresets.find((x) => x.id === presetDeleteConfirmId)?.label ?? presetDeleteConfirmId}» будет удалён. Это не изменит права уже выданные пользователям.
                    </Typography.Body>
                    <Flex gap="0.5rem" wrap="wrap">
                      <button
                        type="button"
                        disabled={presetDeleteLoading}
                        aria-label="Удалить пресет"
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: "0.5rem",
                          border: "none",
                          cursor: presetDeleteLoading ? "not-allowed" : "pointer",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          background: "var(--color-error, #dc2626)",
                          color: "#fff",
                          opacity: presetDeleteLoading ? 0.8 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (presetDeleteLoading) return;
                          setPresetFormError(null);
                          setPresetDeleteLoading(true);
                          const idToDelete = presetDeleteConfirmId;
                          if (!idToDelete) {
                            setPresetDeleteLoading(false);
                            return;
                          }
                          fetch(`/api/admin-presets?id=${encodeURIComponent(idToDelete)}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${adminToken}` },
                          })
                            .then((res) => res.json().then((data: { deleted?: boolean; error?: string }) => ({ status: res.status, data })).catch(() => ({ status: res.status, data: {} as { deleted?: boolean; error?: string } })))
                            .then(({ status, data }) => {
                              if (status >= 200 && status < 300 && data.deleted !== false) {
                                setPresetDeleteConfirmId(null);
                                fetchPresets();
                              } else {
                                setPresetFormError(data?.error || "Не удалось удалить пресет");
                              }
                            })
                            .catch(() => {
                              setPresetFormError("Не удалось удалить пресет");
                            })
                            .finally(() => setPresetDeleteLoading(false));
                        }}
                      >
                        {presetDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} /> : null}
                        Удалить
                      </button>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={presetDeleteLoading}
                        onClick={(e) => { e.stopPropagation(); setPresetDeleteConfirmId(null); }}
                        aria-label="Отмена, не удалять пресет"
                      >
                        Отмена
                      </Button>
                    </Flex>
                  </div>
                </div>
              )}
            </>
          )}
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
    </div>
  );
}
