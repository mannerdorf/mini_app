import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Loader2, Plus, LogOut, Trash2, Eye, EyeOff, Activity, Copy, Building2, History, Layers, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Mail, Sun, Moon, Calendar, AlertCircle, Download, Clock, Receipt, BarChart3, Calculator, ClipboardList, FileText } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { CustomerPickModal, type CustomerItem } from "../components/modals/CustomerPickModal";
import type { ExpenseRequestItem } from "./ExpenseRequestsPage";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { PnlSection } from "../pnl/PnlSection";
import { RefSubdivisionsView } from "../pnl/RefSubdivisionsView";
import { SUBDIVISIONS } from "../pnl/constants";
import { stripOoo } from "../lib/formatUtils";

const PERMISSION_KEYS = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "accounting", label: "Бухгалтерия" },
  { key: "home", label: "Главная" },
  { key: "dashboard", label: "Дашборды" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_sendings", label: "Отправки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
  { key: "haulz", label: "HAULZ" },
  { key: "service_mode", label: "Служебный режим" },
  { key: "analytics", label: "Аналитика" },
  { key: "supervisor", label: "Руководитель" },
  { key: "eor", label: "EOR" },
] as const;

/** Первая строка разделов: при активном — красная (для HAULZ — зелёная, для EOR — яркая бирюзовая). Аналитику может включить только суперадмин. По умолчанию при регистрации: Фин. показатели и Руководитель — активны, остальное — пассивно. */
const PERMISSION_ROW1 = [
  { key: "__financial__", label: "Фин. показатели" as const },
  { key: "supervisor", label: "Руководитель" as const },
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "service_mode", label: "Служебный режим" },
  { key: "analytics", label: "Аналитика" as const },
  { key: "haulz", label: "HAULZ" as const },
  { key: "eor", label: "EOR" as const },
  { key: "accounting", label: "Бухгалтерия" as const },
] as const;

/** Вторая строка разделов: при активном — синяя */
const PERMISSION_ROW2 = [
  { key: "home", label: "Главная" },
  { key: "dashboard", label: "Дашборды" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_sendings", label: "Отправки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
] as const;

export type PermissionPreset = { id: string; label: string; permissions: Record<string, boolean>; financial: boolean; serviceMode: boolean };

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

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/** Варианты срока оплаты (календарных дней с момента выставления счёта) в платёжном календаре */
const PAYMENT_DAYS_OPTIONS = [0, 3, 5, 7, 14, 21, 30, 45, 60, 90];
/** Платежные дни недели — только рабочие (1=пн … 5=пт). Выходные не допускаются. */
const PAYMENT_WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
];

/** Рабочие дни недели (1=пн … 7=вс) для графика работы */
const WORK_SCHEDULE_WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

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

type EmployeeDirectoryRow = {
  id: number;
  login: string;
  full_name: string;
  department: string;
  position: string;
  accrual_type: "hour" | "shift" | "month" | null;
  accrual_rate: number | null;
  cooperation_type: "self_employed" | "ip" | "staff" | null;
  employee_role: "employee" | "department_head";
  active: boolean;
  invited_with_preset_label: string | null;
  created_at: string;
};

type AccrualType = "hour" | "shift" | "month";

/** Fallback при пустом справочнике подразделений */
const EMPLOYEE_DEPARTMENTS_FALLBACK = ["Склад Москва", "Склад Калининград", "Отдел продаж", "Управляющая компания"];
const COOPERATION_TYPE_OPTIONS = [
  { value: "self_employed", label: "Самозанятость" },
  { value: "ip", label: "ИП" },
  { value: "staff", label: "Штатный сотрудник" },
] as const;

const CLAIM_STATUS_LABELS_RU: Record<string, string> = {
  draft: "Черновик",
  new: "Новая",
  under_review: "На рассмотрении",
  waiting_docs: "Ожидает документы",
  in_progress: "В работе",
  awaiting_leader: "Ожидает решения руководителя",
  sent_to_accounting: "Передана в бухгалтерию",
  approved: "Удовлетворена",
  rejected: "Отказ",
  paid: "Выплачено",
  offset: "Зачтено",
  closed: "Закрыта",
};
const CLAIM_MANIPULATION_SIGN_LABELS_RU: Record<string, string> = {
  fragile: "Хрупкое",
  keep_dry: "Беречь от влаги",
  this_side_up: "Верх / Не кантовать",
  do_not_stack: "Не штабелировать",
  temperature_control: "Температурный режим",
  handle_with_care: "Осторожно, обращаться бережно",
};
const CLAIM_PACKAGING_TYPE_LABELS_RU: Record<string, string> = {
  box: "Коробка",
  pallet: "Паллет",
  crate: "Ящик",
  bag: "Мешок",
  film: "Стретч-пленка",
  wooden_frame: "Обрешетка",
  without_packaging: "Без упаковки",
};
const CLAIMS_FILTER_CONTROL_HEIGHT = 34;

const PEREVOZKA_NOMENCLATURE_KEYS = ["Packages", "Nomenclature", "Goods", "CargoNomenclature", "ПринятыйГруз", "Номенклатура", "TablePart", "CargoItems", "Items", "GoodsList", "Nomenklatura"] as const;

function parseLooseNumber(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function normalizePlaceKey(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function extractPlaceNumberFromLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.split("—")[0]?.trim() || raw;
}

function extractPerevozkaNomenclatureRows(payload: any): Record<string, unknown>[] {
  const tryExtract = (obj: any): Record<string, unknown>[] => {
    if (!obj || typeof obj !== "object") return [];
    for (const key of PEREVOZKA_NOMENCLATURE_KEYS) {
      const val = obj?.[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) return val as Record<string, unknown>[];
    }
    for (const key of Object.keys(obj)) {
      const val = obj?.[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) return val as Record<string, unknown>[];
    }
    return [];
  };
  const fromRoot = tryExtract(payload);
  if (fromRoot.length) return fromRoot;
  for (const key of ["Response", "Data", "Result", "result", "data"]) {
    const fromNested = tryExtract(payload?.[key]);
    if (fromNested.length) return fromNested;
  }
  return [];
}

function pickFirstNumericField(source: any, fieldNames: string[]): number {
  for (const field of fieldNames) {
    const value = parseLooseNumber(source?.[field]);
    if (value > 0) return value;
  }
  return 0;
}
function mapClaimEnumValuesToRu(values: unknown, labels: Record<string, string>): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .map((v) => labels[v] || v);
}
type CooperationType = typeof COOPERATION_TYPE_OPTIONS[number]["value"];
const normalizeCooperationType = (value: unknown): CooperationType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  return "staff";
};
const cooperationTypeLabel = (value: unknown) =>
  COOPERATION_TYPE_OPTIONS.find((x) => x.value === normalizeCooperationType(value))?.label || "Штатный сотрудник";

type PnlExpenseCategoryLink = {
  expenseCategoryId?: string | null;
  name?: string | null;
  department: string;
  logisticsStage: string | null;
};

type PnlExpensePrefill = {
  requestId: string;
  expenseCategoryId?: string;
  categoryName?: string;
  subdivision: string;
  type: "OPEX";
};

function UserRow({
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
        return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
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
                Создан: {new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
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

const ADMIN_THEME_KEY = "admin-theme";
const ADMIN_TAB_KEY = "haulz.admin.tab";
const ADMIN_TABS = ["users", "templates", "customers", "suppliers", "tariffs", "sverki", "dogovors", "audit", "logs", "integrations", "employee_directory", "subdivisions", "presets", "payment_calendar", "work_schedule", "timesheet", "expense_requests", "accounting", "claims", "pnl"] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

function getInitialAdminTab(): AdminTab {
  if (typeof window === "undefined") return "users";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("admin");
    if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) return fromUrl as AdminTab;
    const fromStorage = localStorage.getItem(ADMIN_TAB_KEY);
    if (fromStorage && ADMIN_TABS.includes(fromStorage as AdminTab)) return fromStorage as AdminTab;
  } catch {
    /* ignore */
  }
  return "users";
}

export function AdminPage({ adminToken, onBack, onLogout }: AdminPageProps) {
  const USERS_PAGE_SIZE = 50;
  const [tab, setTabState] = useState<AdminTab>(getInitialAdminTab);
  const setTab = useCallback((next: AdminTab) => {
    setTabState(next);
    try {
      localStorage.setItem(ADMIN_TAB_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set("admin", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("admin");
      if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) {
        setTabState((prev) => (prev !== fromUrl ? (fromUrl as AdminTab) : prev));
      } else {
        const fromStorage = localStorage.getItem(ADMIN_TAB_KEY);
        if (fromStorage && ADMIN_TABS.includes(fromStorage as AdminTab)) {
          setTabState((prev) => (prev !== fromStorage ? (fromStorage as AdminTab) : prev));
          url.searchParams.set("admin", fromStorage);
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch {
      /* ignore */
    }
    const onPopState = () => {
      try {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get("admin");
        if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) {
          setTabState(fromUrl as AdminTab);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [accountingSubsection, setAccountingSubsection] = useState<"expense_requests" | "sverki" | "claims">("expense_requests");
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const isJournalTab = tab === "audit" || tab === "logs" || tab === "integrations";
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem(ADMIN_THEME_KEY);
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const el = typeof document !== "undefined" ? document.body : null;
    if (!el) return;
    if (theme === "light") {
      el.classList.add("light-mode");
    } else {
      el.classList.remove("light-mode");
    }
    return () => el.classList.remove("light-mode");
  }, [theme]);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);
  const [users, setUsers] = useState<User[]>([]);
  const [lastLoginAvailable, setLastLoginAvailable] = useState(true);
  const [topActiveExpanded, setTopActiveExpanded] = useState(false);
  const [topActiveMode, setTopActiveMode] = useState<"users" | "customers">("users");
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [usersViewMode, setUsersViewMode] = useState<"login" | "customer">("login");
  /** В режиме «По заказчикам» — какие группы развёрнуты (показаны логины) */
  const [expandedCustomerLabels, setExpandedCustomerLabels] = useState<Set<string>>(new Set());
  const [usersSortBy, setUsersSortBy] = useState<"email" | "date" | "active">("email");
  const [usersSortOrder, setUsersSortOrder] = useState<"asc" | "desc">("asc");
  const [usersFilterBy, setUsersFilterBy] = useState<"all" | "cms" | "no_cms" | "service_mode" | "supervisor" | "no_supervisor" | "analytics" | "no_analytics" | "home" | "no_home" | "dashboard" | "no_dashboard" | "sendings" | "no_sendings">("all");
  const [usersFilterLastLogin, setUsersFilterLastLogin] = useState<"all" | "7d" | "30d" | "never" | "old">("all");
  const [usersFilterActive, setUsersFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [usersFilterPresetId, setUsersFilterPresetId] = useState<string>("");
  const [usersVisibleCount, setUsersVisibleCount] = useState(50);
  const [deactivateConfirmUserId, setDeactivateConfirmUserId] = useState<number | null>(null);
  const [bulkDeactivateConfirmOpen, setBulkDeactivateConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [bulkPermissions, setBulkPermissions] = useState<Record<string, boolean>>({
    cms_access: false, home: true, dashboard: true, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_sendings: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, haulz: false, service_mode: false, analytics: false, supervisor: false, eor: false,
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
  const [customersFetchTrigger, setCustomersFetchTrigger] = useState(0);
  const [suppliersList, setSuppliersList] = useState<{ inn: string; supplier_name: string; email: string }[]>([]);
  const [suppliersSearch, setSuppliersSearch] = useState("");
  const [suppliersShowOnlyWithoutEmail, setSuppliersShowOnlyWithoutEmail] = useState(false);
  const [suppliersSortBy, setSuppliersSortBy] = useState<"inn" | "supplier_name" | "email">("supplier_name");
  const [suppliersSortOrder, setSuppliersSortOrder] = useState<"asc" | "desc">("asc");
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersFetchTrigger, setSuppliersFetchTrigger] = useState(0);
  const [suppliersSyncLoading, setSuppliersSyncLoading] = useState(false);
  const [suppliersSyncMessage, setSuppliersSyncMessage] = useState<string | null>(null);
  const [suppliersSyncDebugRequest, setSuppliersSyncDebugRequest] = useState<string>("");
  const [suppliersSyncDebugResponse, setSuppliersSyncDebugResponse] = useState<string>("");
  const [tariffsList, setTariffsList] = useState<{
    id: number;
    docDate: string | null;
    docNumber: string;
    customerName: string;
    customerInn: string;
    cityFrom: string;
    cityTo: string;
    transportType: string;
    isDangerous: boolean;
    isVet: boolean;
    tariff: number | null;
    fetchedAt: string;
  }[]>([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsFetchTrigger, setTariffsFetchTrigger] = useState(0);
  const [tariffsSyncLoading, setTariffsSyncLoading] = useState(false);
  const [tariffsSyncMessage, setTariffsSyncMessage] = useState<string | null>(null);
  const [tariffsSyncDebugRequest, setTariffsSyncDebugRequest] = useState<string>("");
  const [tariffsSyncDebugResponse, setTariffsSyncDebugResponse] = useState<string>("");
  const [sverkiList, setSverkiList] = useState<{
    id: number;
    docNumber: string;
    docDate: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    customerName: string;
    customerInn: string;
    fetchedAt: string;
  }[]>([]);
  const [sverkiLoading, setSverkiLoading] = useState(false);
  const [sverkiFetchTrigger, setSverkiFetchTrigger] = useState(0);
  const [sverkiSyncLoading, setSverkiSyncLoading] = useState(false);
  const [sverkiSyncMessage, setSverkiSyncMessage] = useState<string | null>(null);
  const [sverkiDownloadingId, setSverkiDownloadingId] = useState<number | null>(null);
  const [sverkiDownloadError, setSverkiDownloadError] = useState<string | null>(null);
  const [sverkiSyncDebugRequest, setSverkiSyncDebugRequest] = useState<string>("");
  const [sverkiSyncDebugResponse, setSverkiSyncDebugResponse] = useState<string>("");
  const [dogovorsList, setDogovorsList] = useState<{
    id: number;
    docNumber: string;
    docDate: string | null;
    customerName: string;
    customerInn: string;
    title: string;
    fetchedAt: string;
  }[]>([]);
  const [dogovorsLoading, setDogovorsLoading] = useState(false);
  const [dogovorsFetchTrigger, setDogovorsFetchTrigger] = useState(0);
  const [dogovorsSyncLoading, setDogovorsSyncLoading] = useState(false);
  const [dogovorsSyncMessage, setDogovorsSyncMessage] = useState<string | null>(null);
  const [dogovorsSyncDebugRequest, setDogovorsSyncDebugRequest] = useState<string>("");
  const [dogovorsSyncDebugResponse, setDogovorsSyncDebugResponse] = useState<string>("");
  const [dogovorsDownloadingId, setDogovorsDownloadingId] = useState<number | null>(null);
  const [dogovorsDownloadError, setDogovorsDownloadError] = useState<string | null>(null);
  const [sverkiRequests, setSverkiRequests] = useState<{
    id: number;
    login: string;
    customerInn: string;
    contract: string;
    periodFrom: string;
    periodTo: string;
    status: "pending" | "edo_sent";
    createdAt: string;
    updatedAt: string;
  }[]>([]);
  const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
  const [sverkiRequestsUpdatingId, setSverkiRequestsUpdatingId] = useState<number | null>(null);
  const [adminClaims, setAdminClaims] = useState<{
    id: number;
    claimNumber: string;
    customerCompanyName: string;
    customerInn: string;
    cargoNumber: string;
    description: string;
    requestedAmount: number | null;
    approvedAmount: number | null;
    status: string;
    daysInWork: number;
    createdAt: string;
  }[]>([]);
  const [adminClaimsLoading, setAdminClaimsLoading] = useState(false);
  const [adminClaimsStatusFilter, setAdminClaimsStatusFilter] = useState<string>("");
  const [adminClaimsSearch, setAdminClaimsSearch] = useState<string>("");
  const [adminClaimsUpdatingId, setAdminClaimsUpdatingId] = useState<number | null>(null);
  const [adminClaimsView, setAdminClaimsView] = useState<"new" | "in_progress" | "all">("all");
  const [adminClaimsKpi, setAdminClaimsKpi] = useState<{ activeCount: number; overdueCount: number; requestedSum: number; approvedSum: number } | null>(null);
  const [adminClaimsChart, setAdminClaimsChart] = useState<{ day: string; count: number }[]>([]);
  const [adminClaimDetailId, setAdminClaimDetailId] = useState<number | null>(null);
  const [adminClaimDetailReloadTick, setAdminClaimDetailReloadTick] = useState(0);
  const [adminClaimDetailLoading, setAdminClaimDetailLoading] = useState(false);
  const [adminClaimDetail, setAdminClaimDetail] = useState<any | null>(null);
  const [adminClaimNoteDraft, setAdminClaimNoteDraft] = useState("");
  const [adminLeaderCommentDraft, setAdminLeaderCommentDraft] = useState("");
  const [adminClaimApprovedAmountDraft, setAdminClaimApprovedAmountDraft] = useState("");
  const [adminClaimMaxDamageAmount, setAdminClaimMaxDamageAmount] = useState<number | null>(null);
  const [adminClaimMaxDamageLoading, setAdminClaimMaxDamageLoading] = useState(false);
  const [adminClaimDocDownloading, setAdminClaimDocDownloading] = useState<"" | "ЭР" | "АПП">("");
  const [adminClaimDocError, setAdminClaimDocError] = useState<string>("");
  const [adminDelegateOpen, setAdminDelegateOpen] = useState(false);
  const [adminDelegateLogin, setAdminDelegateLogin] = useState("");
  const [adminDelegateComment, setAdminDelegateComment] = useState("");
  const [adminRequestDocsOpen, setAdminRequestDocsOpen] = useState(false);
  const [adminRequestDocUPD, setAdminRequestDocUPD] = useState(false);
  const [adminRequestDocTTN, setAdminRequestDocTTN] = useState(false);
  const [adminRequestDocsComment, setAdminRequestDocsComment] = useState("");
  const [adminClaimAttachRole, setAdminClaimAttachRole] = useState<"manager" | "leader">("manager");
  const [adminClaimAttachPhotoFiles, setAdminClaimAttachPhotoFiles] = useState<File[]>([]);
  const [adminClaimAttachDocumentFiles, setAdminClaimAttachDocumentFiles] = useState<File[]>([]);
  const [adminClaimAttachVideoLink, setAdminClaimAttachVideoLink] = useState("");
  const [adminClaimAttachSubmitting, setAdminClaimAttachSubmitting] = useState(false);
  const [adminClaimAttachError, setAdminClaimAttachError] = useState("");
  const [registeringCustomerInn, setRegisteringCustomerInn] = useState<string | null>(null);
  const [autoRegisterCandidates, setAutoRegisterCandidates] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [autoRegisterStats, setAutoRegisterStats] = useState<{ total: number; withEmail: number; validEmail: number; alreadyRegistered: number } | null>(null);
  const [autoRegisterLoading, setAutoRegisterLoading] = useState(false);
  const [autoRegisterApplying, setAutoRegisterApplying] = useState(false);
  const [autoRegisterAutoModeEnabled, setAutoRegisterAutoModeEnabled] = useState(false);
  const [autoRegisterFetchTrigger, setAutoRegisterFetchTrigger] = useState(0);
  const [autoRegisterBatchSize, setAutoRegisterBatchSize] = useState<number>(20);
  const [autoRegisterResult, setAutoRegisterResult] = useState<{
    processed: number;
    created: number;
    skipped_existing: number;
    email_sent: number;
    email_failed: number;
    remaining_candidates?: number;
    run_limit?: number;
    email_delay_ms?: number;
    email_jitter_ms?: number;
  } | null>(null);
  const [paymentCalendarItems, setPaymentCalendarItems] = useState<{ inn: string; customer_name: string | null; days_to_pay: number; payment_weekdays: number[] }[]>([]);
  const [paymentCalendarLoading, setPaymentCalendarLoading] = useState(false);
  const [paymentCalendarSearch, setPaymentCalendarSearch] = useState("");
  const [paymentCalendarCustomerList, setPaymentCalendarCustomerList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [paymentCalendarCustomerLoading, setPaymentCalendarCustomerLoading] = useState(false);
  const [paymentCalendarSelectedInns, setPaymentCalendarSelectedInns] = useState<Set<string>>(new Set());
  const [paymentCalendarDaysInput, setPaymentCalendarDaysInput] = useState<string>("14");
  const [paymentCalendarSaving, setPaymentCalendarSaving] = useState(false);
  const [paymentCalendarSavingInn, setPaymentCalendarSavingInn] = useState<string | null>(null);
  const [paymentCalendarBulkWeekdays, setPaymentCalendarBulkWeekdays] = useState<number[]>([]);
  const [paymentCalendarSortColumn, setPaymentCalendarSortColumn] = useState<"inn" | "customer_name" | "days_to_pay" | null>(null);
  const [paymentCalendarSortDir, setPaymentCalendarSortDir] = useState<"asc" | "desc">("asc");
  const [workScheduleItems, setWorkScheduleItems] = useState<{ inn: string; customer_name: string | null; days_of_week: number[]; work_start: string; work_end: string }[]>([]);
  const [workScheduleLoading, setWorkScheduleLoading] = useState(false);
  const [workScheduleSearch, setWorkScheduleSearch] = useState("");
  const [workScheduleCustomerList, setWorkScheduleCustomerList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [workScheduleCustomerLoading, setWorkScheduleCustomerLoading] = useState(false);
  const [workScheduleSelectedInns, setWorkScheduleSelectedInns] = useState<Set<string>>(new Set());
  const [workScheduleBulkWeekdays, setWorkScheduleBulkWeekdays] = useState<number[]>([]);
  const [workScheduleBulkStart, setWorkScheduleBulkStart] = useState<string>("09:00");
  const [workScheduleBulkEnd, setWorkScheduleBulkEnd] = useState<string>("18:00");
  const [workScheduleSaving, setWorkScheduleSaving] = useState(false);
  const [workScheduleSavingInn, setWorkScheduleSavingInn] = useState<string | null>(null);
  const paymentCalendarCustomerListSorted = useMemo(() => {
    const withDays = paymentCalendarCustomerList.map((c) => {
      const item = paymentCalendarItems.find((x) => x.inn === c.inn);
      return {
        ...c,
        days: item?.days_to_pay ?? null,
        payment_weekdays: item?.payment_weekdays ?? [],
      };
    });
    if (!paymentCalendarSortColumn) return withDays;
    return [...withDays].sort((a, b) => {
      let va: string | number | null;
      let vb: string | number | null;
      if (paymentCalendarSortColumn === "inn") {
        va = a.inn;
        vb = b.inn;
      } else if (paymentCalendarSortColumn === "customer_name") {
        va = a.customer_name || "";
        vb = b.customer_name || "";
      } else {
        va = a.days ?? -1;
        vb = b.days ?? -1;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return paymentCalendarSortDir === "asc" ? cmp : -cmp;
    });
  }, [paymentCalendarCustomerList, paymentCalendarItems, paymentCalendarSortColumn, paymentCalendarSortDir]);
  const paymentCalendarItemsSorted = useMemo(() => {
    if (!paymentCalendarSortColumn) return paymentCalendarItems;
    return [...paymentCalendarItems].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (paymentCalendarSortColumn === "inn") {
        va = a.inn;
        vb = b.inn;
      } else if (paymentCalendarSortColumn === "customer_name") {
        va = a.customer_name || "";
        vb = b.customer_name || "";
      } else {
        va = a.days_to_pay;
        vb = b.days_to_pay;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return paymentCalendarSortDir === "asc" ? cmp : -cmp;
    });
  }, [paymentCalendarItems, paymentCalendarSortColumn, paymentCalendarSortDir]);
  const workScheduleCustomerListSorted = useMemo(() => {
    const withSchedule = workScheduleCustomerList.map((c) => {
      const item = workScheduleItems.find((x) => x.inn === c.inn);
      return {
        ...c,
        days_of_week: item?.days_of_week ?? [1, 2, 3, 4, 5],
        work_start: item?.work_start ?? "09:00",
        work_end: item?.work_end ?? "18:00",
      };
    });
    return withSchedule;
  }, [workScheduleCustomerList, workScheduleItems]);
  const [auditEntries, setAuditEntries] = useState<{ id: number; action: string; target_type: string; target_id: string | null; details: Record<string, unknown> | null; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilterAction, setAuditFilterAction] = useState<string>("");
  const [auditFilterTargetType, setAuditFilterTargetType] = useState<string>("");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [auditFetchTrigger, setAuditFetchTrigger] = useState(0);
  const [errorLogEntries, setErrorLogEntries] = useState<{ id: number; path: string; method: string; status_code: number; error_message: string | null; details: Record<string, unknown> | null; created_at: string }[]>([]);
  const [errorLogLoading, setErrorLogLoading] = useState(false);
  const [errorLogSearch, setErrorLogSearch] = useState("");
  const [errorLogStatusFilter, setErrorLogStatusFilter] = useState("");
  const [errorLogFromDate, setErrorLogFromDate] = useState("");
  const [errorLogToDate, setErrorLogToDate] = useState("");
  const [errorLogFetchTrigger, setErrorLogFetchTrigger] = useState(0);
  const [integrationDays, setIntegrationDays] = useState<number>(30);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationFetchTrigger, setIntegrationFetchTrigger] = useState(0);
  const [integrationSendLkSyncLoading, setIntegrationSendLkSyncLoading] = useState(false);
  const [integrationSendLkSyncResult, setIntegrationSendLkSyncResult] = useState<string | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<{
    telegram: {
      linked_total: number;
      active: number;
      pending: number;
      disabled: number;
      avg_lifetime_hours_active: number | null;
      avg_pending_hours: number | null;
      pin_email_sent: number;
      pin_email_failed: number;
      webhook_errors: number;
    };
    email_delivery: {
      registration: { sent: number; failed: number };
      password_reset: { sent: number; failed: number };
      telegram_pin: { sent: number; failed: number };
      api_errors: { register: number; reset: number; tg_webhook: number };
      sendlk: { sent: number; failed: number; skipped: number; bulk_runs: number };
      daily: Array<{
        day: string;
        registration_sent: number;
        registration_failed: number;
        password_reset_sent: number;
        password_reset_failed: number;
        telegram_pin_sent: number;
        telegram_pin_failed: number;
        total_sent: number;
        total_failed: number;
      }>;
    };
    voice_assistant: {
      linked_logins: number;
      linked_chats_unique: number;
      link_errors: number;
      max_link_errors: number;
      max_webhook_errors: number;
    };
  } | null>(null);
  const [permissionPresets, setPermissionPresets] = useState<PermissionPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetEditingId, setPresetEditingId] = useState<string | null>(null);
  const [presetFormLabel, setPresetFormLabel] = useState("");
  const [presetFormPermissions, setPresetFormPermissions] = useState<Record<string, boolean>>({
    cms_access: false, home: true, dashboard: true, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_sendings: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, haulz: false, service_mode: false, analytics: false, supervisor: false, eor: false,
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
  const [adminMeLoaded, setAdminMeLoaded] = useState(false);
  const [adminExpenseRequests, setAdminExpenseRequests] = useState<(ExpenseRequestItem & { login: string })[]>([]);
  const [adminExpenseSortCol, setAdminExpenseSortCol] = useState<"createdAt" | "docNumber" | "docDate" | "period" | "department" | "categoryName" | "amount" | "status" | "login">("createdAt");
  const [adminExpenseSortAsc, setAdminExpenseSortAsc] = useState(false);
  const [expenseFilterDate, setExpenseFilterDate] = useState("");
  const [expenseFilterDepartment, setExpenseFilterDepartment] = useState("");
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("");
  const [expenseFilterVehicle, setExpenseFilterVehicle] = useState("");
  const [expenseFilterEmployee, setExpenseFilterEmployee] = useState("");
  const [expenseFilterStatus, setExpenseFilterStatus] = useState("");
  const [pnlExpenseCategoryLinks, setPnlExpenseCategoryLinks] = useState<PnlExpenseCategoryLink[]>([]);
  const [pnlExpensePrefill, setPnlExpensePrefill] = useState<PnlExpensePrefill | null>(null);
  const [expenseRejectId, setExpenseRejectId] = useState<string | null>(null);
  const [expenseRejectComment, setExpenseRejectComment] = useState("");
  const [expenseViewId, setExpenseViewId] = useState<string | null>(null);
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [expenseEditDocNumber, setExpenseEditDocNumber] = useState("");
  const [expenseEditDocDate, setExpenseEditDocDate] = useState("");
  const [expenseEditPeriod, setExpenseEditPeriod] = useState("");
  const [expenseEditDepartment, setExpenseEditDepartment] = useState("");
  const [expenseEditCategory, setExpenseEditCategory] = useState("");
  const [expenseEditAmount, setExpenseEditAmount] = useState("");
  const [expenseEditVatRate, setExpenseEditVatRate] = useState("");
  const [expenseEditComment, setExpenseEditComment] = useState("");
  const [expenseEditVehicle, setExpenseEditVehicle] = useState("");
  const [expenseEditEmployee, setExpenseEditEmployee] = useState("");
  const [expenseEditSupplierName, setExpenseEditSupplierName] = useState("");
  const [expenseEditSupplierInn, setExpenseEditSupplierInn] = useState("");
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
    home: true,
    dashboard: true,
    cargo: true,
    doc_invoices: true,
    doc_acts: true,
    doc_orders: true,
    doc_sendings: true,
    doc_claims: true,
    doc_contracts: true,
    doc_acts_settlement: true,
    doc_tariffs: true,
    haulz: false,
    service_mode: false,
    analytics: false,
    supervisor: true,
    eor: false,
  });
  const [formSelectedPresetId, setFormSelectedPresetId] = useState<string>("");
  const [formFinancial, setFormFinancial] = useState(true);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);
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
  const [userChangeEntries, setUserChangeEntries] = useState<{ id: number; action: string; details: Record<string, unknown> | null; created_at: string }[]>([]);
  const [userChangeLoading, setUserChangeLoading] = useState(false);
  const [userChangeQuery, setUserChangeQuery] = useState("");
  const [employeeDirectoryItems, setEmployeeDirectoryItems] = useState<EmployeeDirectoryRow[]>([]);
  const [employeeDirectoryLoading, setEmployeeDirectoryLoading] = useState(false);
  const [employeeDepartments, setEmployeeDepartments] = useState<string[]>([]);
  const [employeeDirectoryEmail, setEmployeeDirectoryEmail] = useState("");
  const [employeeDirectoryFullName, setEmployeeDirectoryFullName] = useState("");
  const [employeeDirectoryDepartment, setEmployeeDirectoryDepartment] = useState<string>("");
  const [employeeDirectoryDepartments, setEmployeeDirectoryDepartments] = useState<string[]>([]);
  const [employeeDirectoryPrimaryDepartment, setEmployeeDirectoryPrimaryDepartment] = useState<string>("");
  const [employeeDirectoryPosition, setEmployeeDirectoryPosition] = useState("");
  const [employeeDirectoryAccrualType, setEmployeeDirectoryAccrualType] = useState<AccrualType>("hour");
  const [employeeDirectoryAccrualRate, setEmployeeDirectoryAccrualRate] = useState("0");
  const [employeeDirectoryCooperationType, setEmployeeDirectoryCooperationType] = useState<CooperationType>("staff");
  const [employeeDirectoryRole, setEmployeeDirectoryRole] = useState<"employee" | "department_head">("employee");
  const [employeeDirectorySaving, setEmployeeDirectorySaving] = useState(false);
  const [employeeDirectoryEditingId, setEmployeeDirectoryEditingId] = useState<number | null>(null);
  const [employeeDirectoryEditFullName, setEmployeeDirectoryEditFullName] = useState("");
  const [employeeDirectoryEditDepartment, setEmployeeDirectoryEditDepartment] = useState<string>("");
  const [employeeDirectoryEditDepartments, setEmployeeDirectoryEditDepartments] = useState<string[]>([]);
  const [employeeDirectoryEditPrimaryDepartment, setEmployeeDirectoryEditPrimaryDepartment] = useState<string>("");
  const [employeeDirectoryEditPosition, setEmployeeDirectoryEditPosition] = useState("");
  const [employeeDirectoryEditAccrualType, setEmployeeDirectoryEditAccrualType] = useState<AccrualType>("hour");
  const [employeeDirectoryEditAccrualRate, setEmployeeDirectoryEditAccrualRate] = useState("0");
  const [employeeDirectoryEditCooperationType, setEmployeeDirectoryEditCooperationType] = useState<CooperationType>("staff");
  const [employeeDirectoryEditRole, setEmployeeDirectoryEditRole] = useState<"employee" | "department_head">("employee");
  const [employeeDirectoryEditSaving, setEmployeeDirectoryEditSaving] = useState(false);
  const [timesheetMonth, setTimesheetMonth] = useState<string>(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
  const [timesheetSearch, setTimesheetSearch] = useState("");
  const [timesheetHours, setTimesheetHours] = useState<Record<string, string>>({});
  const [timesheetPaymentMarks, setTimesheetPaymentMarks] = useState<Record<string, boolean>>({});
  const [timesheetShiftRateOverrides, setTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
  const [timesheetExpandedEmployeeId, setTimesheetExpandedEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutsByEmployee, setTimesheetPayoutsByEmployee] = useState<Record<string, Array<{
    id: number;
    payoutDate: string;
    periodFrom: string;
    periodTo: string;
    amount: number;
    taxAmount: number;
    cooperationType: string;
    paidDates?: string[];
    createdAt: string;
  }>>>({});
  const [timesheetPayoutSavingEmployeeId, setTimesheetPayoutSavingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditingId, setTimesheetPayoutEditingId] = useState<number | null>(null);
  const [timesheetPayoutEditingEmployeeId, setTimesheetPayoutEditingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditDate, setTimesheetPayoutEditDate] = useState("");
  const [timesheetPayoutEditAmount, setTimesheetPayoutEditAmount] = useState("");
  const [timesheetPayoutActionLoadingId, setTimesheetPayoutActionLoadingId] = useState<number | null>(null);
  const [timesheetMobilePicker, setTimesheetMobilePicker] = useState(false);
  const WORK_DAYS_IN_MONTH = 21;
  const TIMESHEET_MONTH_OPTIONS = [
    { value: "01", label: "январь" },
    { value: "02", label: "февраль" },
    { value: "03", label: "март" },
    { value: "04", label: "апрель" },
    { value: "05", label: "май" },
    { value: "06", label: "июнь" },
    { value: "07", label: "июль" },
    { value: "08", label: "август" },
    { value: "09", label: "сентябрь" },
    { value: "10", label: "октябрь" },
    { value: "11", label: "ноябрь" },
    { value: "12", label: "декабрь" },
  ] as const;
  const timesheetMonthParts = useMemo(() => {
    const match = /^(\d{4})-(\d{2})$/.exec(timesheetMonth);
    if (match) return { year: match[1], month: match[2] };
    const now = new Date();
    return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, "0") };
  }, [timesheetMonth]);
  const timesheetYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1, Number(timesheetMonthParts.year)]);
    return Array.from(years)
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => b - a)
      .map(String);
  }, [timesheetMonthParts.year]);
  const SHIFT_MARK_OPTIONS = [
    { code: "Я", label: "Явка", bg: "#35c46a", color: "#ffffff", border: "#1f8f45" },
    { code: "ПР", label: "Прогул", bg: "#ef4444", color: "#ffffff", border: "#dc2626" },
    { code: "Б", label: "Болезнь", bg: "#f59e0b", color: "#111827", border: "#d97706" },
    { code: "В", label: "Выходной", bg: "#94a3b8", color: "#ffffff", border: "#64748b" },
    { code: "ОГ", label: "Отгул", bg: "#8b5cf6", color: "#ffffff", border: "#7c3aed" },
    { code: "ОТ", label: "Отпуск", bg: "#3b82f6", color: "#ffffff", border: "#2563eb" },
    { code: "УВ", label: "Уволен", bg: "#6b7280", color: "#ffffff", border: "#4b5563" },
  ] as const;
  const SHIFT_MARK_CODES = SHIFT_MARK_OPTIONS.map((x) => x.code);
  type ShiftMarkCode = typeof SHIFT_MARK_OPTIONS[number]["code"];
  const [adminShiftPicker, setAdminShiftPicker] = useState<{ key: string; employeeId: number; dateIso: string; x: number; y: number; isShift: boolean } | null>(null);
  const adminShiftHoldTimerRef = useRef<number | null>(null);
  const adminShiftHoldTriggeredRef = useRef(false);
  const normalizeAccrualType = (value: unknown): AccrualType => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "hour";
    if (raw === "month" || raw === "месяц" || raw === "monthly" || raw.includes("month") || raw.includes("месяц")) return "month";
    if (raw === "shift" || raw === "смена" || raw.includes("shift") || raw.includes("смен")) return "shift";
    return "hour";
  };
  const isShiftAccrualType = (value: unknown) => {
    return normalizeAccrualType(value) === "shift";
  };
  const isMarkAccrualType = (value: unknown) => {
    const accrualType = normalizeAccrualType(value);
    return accrualType === "shift" || accrualType === "month";
  };
  const getDayRateByAccrualType = (rate: number, accrualType: AccrualType) => {
    return accrualType === "month" ? rate / WORK_DAYS_IN_MONTH : rate;
  };
  const normalizeShiftMark = (rawValue: string): ShiftMarkCode | "" => {
    const raw = String(rawValue || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw === "Я") return "Я";
    if (raw === "ПР") return "ПР";
    if (raw === "Б") return "Б";
    if (raw === "В") return "В";
    if (raw === "ОГ") return "ОГ";
    if (raw === "ОТ") return "ОТ";
    if (raw === "УВ") return "УВ";
    if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE") return "Я";
    return "";
  };
  const getShiftMarkStyle = (mark: ShiftMarkCode | "") => {
    const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
    if (!option) return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
    return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
  };
  const calcMonthlyByRate = (rateRaw: string, accrualType: AccrualType): number => {
    const rate = Number(String(rateRaw || "").replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0) return 0;
    if (accrualType === "month") return rate;
    return accrualType === "shift" ? rate * WORK_DAYS_IN_MONTH : rate * 8 * WORK_DAYS_IN_MONTH;
  };
  const parseTimesheetHoursValue = (rawValue: string): number => {
    const raw = String(rawValue || "").trim();
    if (!raw) return 0;
    const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      const h = Number(hhmm[1]);
      const m = Number(hhmm[2]);
      if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
    }
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const employeeDirectoryMonthlyEstimate = useMemo(
    () => calcMonthlyByRate(employeeDirectoryAccrualRate, employeeDirectoryAccrualType),
    [employeeDirectoryAccrualRate, employeeDirectoryAccrualType]
  );
  const employeeDirectoryEditMonthlyEstimate = useMemo(
    () => calcMonthlyByRate(employeeDirectoryEditAccrualRate, employeeDirectoryEditAccrualType),
    [employeeDirectoryEditAccrualRate, employeeDirectoryEditAccrualType]
  );
  const toHalfHourValue = (raw: string) => {
    const parsed = Number(String(raw || "").replace(",", "."));
    if (!Number.isFinite(parsed)) return "0.0";
    const normalized = Math.max(0, Math.min(24, parsed));
    return (Math.round(normalized * 2) / 2).toFixed(1);
  };
  const getHourlyCellMark = (rawValue: string): ShiftMarkCode | "" => {
    const mark = normalizeShiftMark(rawValue);
    if (mark) return mark;
    return parseTimesheetHoursValue(rawValue) > 0 ? "Я" : "В";
  };
  const timesheetHalfHourOptions = useMemo(() => {
    return Array.from({ length: 49 }, (_, idx) => {
      const hours = Math.floor(idx / 2);
      const mins = idx % 2 === 0 ? "00" : "30";
      const value = (idx * 0.5).toFixed(1);
      return { value, label: `${hours}:${mins}` };
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setTimesheetMobilePicker(window.matchMedia("(max-width: 768px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const timesheetDays = useMemo(() => {
    const [yRaw, mRaw] = (timesheetMonth || "").split("-");
    const year = Number(yRaw);
    const month = Number(mRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [] as { iso: string; day: number; weekdayShort: string; isWeekend: boolean }[];
    const daysInMonth = new Date(year, month, 0).getDate();
    const weekdayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const out: { iso: string; day: number; weekdayShort: string; isWeekend: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      const wd = dt.getDay();
      out.push({
        iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        weekdayShort: weekdayShort[wd] ?? "",
        isWeekend: wd === 0 || wd === 6,
      });
    }
    return out;
  }, [timesheetMonth]);

  const timesheetEmployeesByDepartment = useMemo(() => {
    const getTimesheetDepartmentLabel = (emp: EmployeeDirectoryRow): string => {
      const raw = String(emp.department || "").trim();
      if (!raw) return "Без подразделения";
      // For department heads, keep only the primary (first) subdivision.
      // For regular employees, department should be single, but we still normalize defensively.
      return raw.split(",").map((part) => part.trim()).find(Boolean) || "Без подразделения";
    };
    const q = timesheetSearch.trim().toLowerCase();
    const filtered = employeeDirectoryItems.filter((emp) => {
      if (!q) return true;
      const haystack = [emp.full_name, emp.login, getTimesheetDepartmentLabel(emp), emp.position]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
    const grouped = new Map<string, EmployeeDirectoryRow[]>();
    for (const emp of filtered) {
      const dep = getTimesheetDepartmentLabel(emp);
      const list = grouped.get(dep) || [];
      list.push(emp);
      grouped.set(dep, list);
    }
    return Array.from(grouped.entries())
      .map(([department, employees]) => ({
        department,
        employees: [...employees].sort((a, b) => {
          const posA = String(a.position || "").trim();
          const posB = String(b.position || "").trim();
          const posCmp = (posA || "\uffff").localeCompare((posB || "\uffff"), "ru");
          if (posCmp !== 0) return posCmp;
          return String(a.full_name || a.login).localeCompare(String(b.full_name || b.login), "ru");
        }),
      }))
      .sort((a, b) => a.department.localeCompare(b.department, "ru"));
  }, [employeeDirectoryItems, timesheetSearch]);
  const timesheetDepartmentSummaries = useMemo(() => {
    return timesheetEmployeesByDepartment.map((group) => {
      let totalHours = 0;
      let totalShifts = 0;
      let totalMoney = 0;
      let totalMoneyToPay = 0;
      let totalPaid = 0;
      for (const emp of group.employees) {
        const accrualType = normalizeAccrualType(emp.accrual_type);
        const isShiftAccrual = accrualType === "shift";
        const isMarkAccrual = isMarkAccrualType(accrualType);
        const rate = Number(emp.accrual_rate ?? 0);
        const employeePaid = (timesheetPayoutsByEmployee[String(emp.id)] || []).reduce((acc, payout) => {
          return acc + Number(payout.amount || 0);
        }, 0);
        totalPaid += employeePaid;
        if (isMarkAccrual) {
          const shifts = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
          }, 0);
          const paidShifts = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (!timesheetPaymentMarks[key]) return acc;
            return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
          }, 0);
          const totalShiftMoney = isShiftAccrual
            ? timesheetDays.reduce((acc, d) => {
                const key = `${emp.id}__${d.iso}`;
                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                const override = Number(timesheetShiftRateOverrides[key]);
                const dayRate = Number.isFinite(override) ? override : rate;
                return acc + dayRate;
              }, 0)
            : shifts * getDayRateByAccrualType(rate, accrualType);
          const paidShiftMoney = isShiftAccrual
            ? timesheetDays.reduce((acc, d) => {
                const key = `${emp.id}__${d.iso}`;
                if (!timesheetPaymentMarks[key]) return acc;
                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                const override = Number(timesheetShiftRateOverrides[key]);
                const dayRate = Number.isFinite(override) ? override : rate;
                return acc + dayRate;
              }, 0)
            : paidShifts * getDayRateByAccrualType(rate, accrualType);
          totalShifts += shifts;
          totalHours += shifts * 8;
          totalMoney += totalShiftMoney;
          totalMoneyToPay += paidShiftMoney;
        } else {
          const hours = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
          }, 0);
          const paidHours = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (!timesheetPaymentMarks[key]) return acc;
            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
          }, 0);
          totalHours += hours;
          totalMoney += hours * rate;
          totalMoneyToPay += paidHours * rate;
        }
      }
      return {
        department: group.department,
        totalHours: Number(totalHours.toFixed(2)),
        totalShifts,
        totalMoney: Number(totalMoney.toFixed(2)),
        totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
      };
    });
  }, [timesheetEmployeesByDepartment, timesheetDays, timesheetHours, timesheetPaymentMarks, timesheetShiftRateOverrides, timesheetPayoutsByEmployee]);
  const timesheetCompanySummary = useMemo(() => {
    const totalHours = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalHours, 0);
    const totalShifts = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalShifts, 0);
    const totalMoney = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalMoney, 0);
    const totalMoneyToPay = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalMoneyToPay, 0);
    const totalPaid = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalPaid, 0);
    return {
      totalHours: Number(totalHours.toFixed(2)),
      totalShifts,
      totalMoney: Number(totalMoney.toFixed(2)),
      totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
    };
  }, [timesheetDepartmentSummaries]);
  const timesheetMonthPaymentStatus = useMemo(() => {
    const totalAccrued = Number(timesheetCompanySummary.totalMoney || 0);
    const paidTotal = Object.values(timesheetPayoutsByEmployee).reduce((acc, payouts) => {
      return acc + payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    }, 0);
    if (totalAccrued <= 0) {
      return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
    }
    if (paidTotal <= 0) {
      return { code: "unpaid", label: "Не выплачено", bg: "#fef2f2", border: "#dc2626", color: "#991b1b" };
    }
    if (paidTotal + 0.01 >= totalAccrued) {
      return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
    }
    return { code: "partial", label: "Выплачено частично", bg: "#fffbeb", border: "#d97706", color: "#92400e" };
  }, [timesheetCompanySummary.totalMoney, timesheetPayoutsByEmployee]);
  const timesheetPaidDateKeys = useMemo(() => {
    const out = new Set<string>();
    for (const [employeeId, payouts] of Object.entries(timesheetPayoutsByEmployee || {})) {
      for (const payout of payouts || []) {
        for (const date of Array.isArray(payout?.paidDates) ? payout.paidDates : []) {
          out.add(`${employeeId}__${String(date || "")}`);
        }
      }
    }
    return out;
  }, [timesheetPayoutsByEmployee]);

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

  const fetchUsersRef = useRef(fetchUsers);
  const fetchTemplatesRef = useRef(fetchTemplates);
  const fetchingTabRef = useRef<string | null>(null);
  fetchUsersRef.current = fetchUsers;
  fetchTemplatesRef.current = fetchTemplates;
  useEffect(() => {
    if (tab === "users") {
      if (fetchingTabRef.current === "users") return;
      fetchingTabRef.current = "users";
      fetchUsersRef.current()?.finally(() => { fetchingTabRef.current = null; });
    } else if (tab === "templates") {
      if (fetchingTabRef.current === "templates") return;
      fetchingTabRef.current = "templates";
      fetchTemplatesRef.current()?.finally(() => { fetchingTabRef.current = null; });
    } else {
      fetchingTabRef.current = null;
    }
  }, [tab]);

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

    const normalize = (v: string) =>
      v
        .toLowerCase()
        .replace(/[.,;:()"'`]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const companies = u.companies ?? [];
    const names = [
      ...companies.map((c) => String(c?.name ?? "").trim()).filter(Boolean),
      String(u.company_name ?? "").trim(),
    ];
    // In "by customers" mode search must match customer fields strictly.
    if (usersViewMode === "customer") {
      const qNorm = normalize(ql);
      const qTokens = qNorm.split(" ").filter(Boolean);

      return names.some((name) => {
        const n = normalize(name);
        if (!n) return false;
        if (n === qNorm || n.startsWith(qNorm)) return true;
        const words = n.split(" ").filter(Boolean);
        return qTokens.every((t) => words.some((w) => w.startsWith(t)));
      });
    }

    // In "by logins" mode keep broad search in login + customer fields.
    if (u.login && String(u.login).toLowerCase().includes(ql)) return true;
    const searchIn = [...companies.flatMap((c) => [c.inn, c.name].filter(Boolean)), u.inn, u.company_name].map((s) => String(s).toLowerCase());
    return searchIn.some((s) => s.includes(ql));
  }, [usersViewMode]);

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
      supervisor: base.filter((u) => !!u.permissions?.supervisor).length,
      no_supervisor: base.filter((u) => !u.permissions?.supervisor).length,
      analytics: base.filter((u) => !!u.permissions?.analytics).length,
      no_analytics: base.filter((u) => !u.permissions?.analytics).length,
      home: base.filter((u) => !!u.permissions?.home).length,
      no_home: base.filter((u) => !u.permissions?.home).length,
      dashboard: base.filter((u) => !!u.permissions?.dashboard).length,
      no_dashboard: base.filter((u) => !u.permissions?.dashboard).length,
      sendings: base.filter((u) => !!u.permissions?.doc_sendings).length,
      no_sendings: base.filter((u) => !u.permissions?.doc_sendings).length,
      active: base.filter((u) => !!u.active).length,
      inactive: base.filter((u) => !u.active).length,
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

  const topActiveCustomers = useMemo(() => {
    const map = new Map<string, { customer: string; last_login_at: string | null; users_count: number }>();

    users
      .filter((u) => u.active)
      .forEach((u) => {
        const names = new Set<string>();
        const companyName = (u.company_name ?? "").trim();
        if (companyName) names.add(companyName);
        if (Array.isArray(u.companies)) {
          u.companies.forEach((c) => {
            const n = (c?.name ?? "").trim();
            if (n) names.add(n);
          });
        }
        if (names.size === 0) names.add("Без заказчика");

        names.forEach((name) => {
          const existing = map.get(name);
          if (!existing) {
            map.set(name, {
              customer: name,
              last_login_at: u.last_login_at ?? null,
              users_count: 1,
            });
            return;
          }
          const prevMs = existing.last_login_at ? new Date(existing.last_login_at).getTime() : 0;
          const curMs = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
          existing.users_count += 1;
          if (curMs > prevMs) existing.last_login_at = u.last_login_at ?? null;
        });
      });

    return Array.from(map.values())
      .sort((a, b) => {
        const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        if (bt !== at) return bt - at;
        return a.customer.localeCompare(b.customer, "ru");
      })
      .slice(0, 15);
  }, [users]);

  useEffect(() => {
    setUsersVisibleCount(USERS_PAGE_SIZE);
  }, [usersSearchQuery, usersFilterBy, usersFilterLastLogin, usersFilterActive, usersFilterPresetId]);

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
    if (tab !== "logs") return;
    setErrorLogLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (errorLogSearch.trim()) params.set("q", errorLogSearch.trim());
    if (errorLogStatusFilter) params.set("status", errorLogStatusFilter);
    if (errorLogFromDate) params.set("from", errorLogFromDate);
    if (errorLogToDate) params.set("to", errorLogToDate);
    fetch(`/api/admin-request-error-log?${params.toString()}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { entries?: typeof errorLogEntries }) => setErrorLogEntries(data.entries || []))
      .catch(() => setErrorLogEntries([]))
      .finally(() => setErrorLogLoading(false));
  }, [tab, adminToken, errorLogFetchTrigger]);

  useEffect(() => {
    if (tab !== "integrations") return;
    setIntegrationLoading(true);
    fetch(`/api/admin-integration-health?days=${integrationDays}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) {
          setIntegrationHealth(null);
          return;
        }
        setIntegrationHealth({
          telegram: {
            linked_total: Number(data?.telegram?.linked_total || 0),
            active: Number(data?.telegram?.active || 0),
            pending: Number(data?.telegram?.pending || 0),
            disabled: Number(data?.telegram?.disabled || 0),
            avg_lifetime_hours_active: data?.telegram?.avg_lifetime_hours_active == null ? null : Number(data.telegram.avg_lifetime_hours_active),
            avg_pending_hours: data?.telegram?.avg_pending_hours == null ? null : Number(data.telegram.avg_pending_hours),
            pin_email_sent: Number(data?.telegram?.pin_email_sent || 0),
            pin_email_failed: Number(data?.telegram?.pin_email_failed || 0),
            webhook_errors: Number(data?.telegram?.webhook_errors || 0),
          },
          email_delivery: {
            registration: {
              sent: Number(data?.email_delivery?.registration?.sent || 0),
              failed: Number(data?.email_delivery?.registration?.failed || 0),
            },
            password_reset: {
              sent: Number(data?.email_delivery?.password_reset?.sent || 0),
              failed: Number(data?.email_delivery?.password_reset?.failed || 0),
            },
            telegram_pin: {
              sent: Number(data?.email_delivery?.telegram_pin?.sent || 0),
              failed: Number(data?.email_delivery?.telegram_pin?.failed || 0),
            },
            api_errors: {
              register: Number(data?.email_delivery?.api_errors?.register || 0),
              reset: Number(data?.email_delivery?.api_errors?.reset || 0),
              tg_webhook: Number(data?.email_delivery?.api_errors?.tg_webhook || 0),
            },
            sendlk: {
              sent: Number(data?.email_delivery?.sendlk?.sent || 0),
              failed: Number(data?.email_delivery?.sendlk?.failed || 0),
              skipped: Number(data?.email_delivery?.sendlk?.skipped || 0),
              bulk_runs: Number(data?.email_delivery?.sendlk?.bulk_runs || 0),
            },
            daily: Array.isArray(data?.email_delivery?.daily)
              ? data.email_delivery.daily.map((d: any) => ({
                  day: String(d?.day || ""),
                  registration_sent: Number(d?.registration_sent || 0),
                  registration_failed: Number(d?.registration_failed || 0),
                  password_reset_sent: Number(d?.password_reset_sent || 0),
                  password_reset_failed: Number(d?.password_reset_failed || 0),
                  telegram_pin_sent: Number(d?.telegram_pin_sent || 0),
                  telegram_pin_failed: Number(d?.telegram_pin_failed || 0),
                  total_sent: Number(d?.total_sent || 0),
                  total_failed: Number(d?.total_failed || 0),
                }))
              : [],
          },
          voice_assistant: {
            linked_logins: Number(data?.voice_assistant?.linked_logins || 0),
            linked_chats_unique: Number(data?.voice_assistant?.linked_chats_unique || 0),
            link_errors: Number(data?.voice_assistant?.link_errors || 0),
            max_link_errors: Number(data?.voice_assistant?.max_link_errors || 0),
            max_webhook_errors: Number(data?.voice_assistant?.max_webhook_errors || 0),
          },
        });
      })
      .catch(() => setIntegrationHealth(null))
      .finally(() => setIntegrationLoading(false));
  }, [tab, adminToken, integrationFetchTrigger, integrationDays]);
  const runSendLkBulkSync = useCallback(async () => {
    if (!adminToken) return;
    setIntegrationSendLkSyncLoading(true);
    setIntegrationSendLkSyncResult(null);
    try {
      const res = await fetch("/api/admin-sendlk-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ limit: 500 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка выгрузки SendLK");
      setIntegrationSendLkSyncResult(
        `Выгрузка завершена: выбрано ${Number(data?.selected || 0)}, отправлено ${Number(data?.sent || 0)}, ошибок ${Number(data?.failed || 0)}`
      );
      setIntegrationFetchTrigger((prev) => prev + 1);
    } catch (e: unknown) {
      setIntegrationSendLkSyncResult((e as Error)?.message || "Ошибка выгрузки SendLK");
    } finally {
      setIntegrationSendLkSyncLoading(false);
    }
  }, [adminToken]);

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
  }, [tab, customersSearch, adminToken, customersFetchTrigger]);

  useEffect(() => {
    if (tab !== "suppliers") return;
    setSuppliersLoading(true);
    const query = suppliersSearch.trim();
    const url = query.length >= 2
      ? `/api/admin-suppliers-search?q=${encodeURIComponent(query)}&limit=500`
      : `/api/admin-suppliers-search?q=&limit=10000`;
    fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { suppliers?: { inn: string; supplier_name: string; email: string }[] }) => {
        setSuppliersList(data.suppliers || []);
      })
      .catch(() => setSuppliersList([]))
      .finally(() => setSuppliersLoading(false));
  }, [tab, suppliersSearch, adminToken, suppliersFetchTrigger]);

  useEffect(() => {
    if (tab !== "tariffs") return;
    setTariffsLoading(true);
    fetch("/api/tariffs")
      .then((res) => res.json())
      .then((data: { tariffs?: {
        id: number;
        docDate: string | null;
        docNumber: string;
        customerName: string;
        customerInn: string;
        cityFrom: string;
        cityTo: string;
        transportType: string;
        isDangerous: boolean;
        isVet: boolean;
        tariff: number | null;
        fetchedAt: string;
      }[] }) => {
        setTariffsList(data.tariffs || []);
      })
      .catch(() => setTariffsList([]))
      .finally(() => setTariffsLoading(false));
  }, [tab, tariffsFetchTrigger]);

  useEffect(() => {
    if (tab !== "sverki") return;
    setSverkiLoading(true);
    fetch("/api/sverki")
      .then((res) => res.json())
      .then((data: { sverki?: {
        id: number;
        docNumber: string;
        docDate: string | null;
        periodFrom: string | null;
        periodTo: string | null;
        customerName: string;
        customerInn: string;
        fetchedAt: string;
      }[] }) => {
        setSverkiList(data.sverki || []);
      })
      .catch(() => setSverkiList([]))
      .finally(() => setSverkiLoading(false));
  }, [tab, sverkiFetchTrigger]);

  const downloadSverkaFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null }) => {
    const number = String(row.docNumber || "").trim();
    const docDateRaw = row.docDate;
    const dateDoc = docDateRaw
      ? (() => {
          const d = new Date(docDateRaw);
          if (isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T00:00:00`;
        })()
      : "";
    if (!number || !dateDoc) return;
    setSverkiDownloadingId(row.id);
    setSverkiDownloadError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metod: "АктСверки", number, dateDoc }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || "Не удалось получить документ");
      if (!data?.data) throw new Error("Документ не найден");
      const binary = atob(String(data.data));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = String(data?.name || `АктСверки_${number}.pdf`);
      a.click();
      URL.revokeObjectURL(href);
    } catch (e: unknown) {
      setSverkiDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setSverkiDownloadingId(null);
    }
  }, []);

  useEffect(() => {
    if (tab !== "dogovors") return;
    setDogovorsLoading(true);
    fetch("/api/dogovors")
      .then((res) => res.json())
      .then((data: { dogovors?: {
        id: number;
        docNumber: string;
        docDate: string | null;
        customerName: string;
        customerInn: string;
        title: string;
        fetchedAt: string;
      }[] }) => {
        setDogovorsList(data.dogovors || []);
      })
      .catch(() => setDogovorsList([]))
      .finally(() => setDogovorsLoading(false));
  }, [tab, dogovorsFetchTrigger]);

  const downloadDogovorFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null; customerInn: string }) => {
    const number = String(row.docNumber || "").trim();
    const docDateRaw = row.docDate;
    const dateDog = docDateRaw
      ? (() => {
          const d = new Date(docDateRaw);
          if (isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T00:00:00`;
        })()
      : "";
    const inn = String(row.customerInn || "").trim();
    if (!number || !dateDog || !inn) return;
    setDogovorsDownloadingId(row.id);
    setDogovorsDownloadError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metod: "Договор", number, dateDog, inn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || "Не удалось получить документ");
      if (!data?.data) throw new Error("Документ не найден");
      const binary = atob(String(data.data));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = String(data?.name || `Договор_${number}.pdf`);
      a.click();
      URL.revokeObjectURL(href);
    } catch (e: unknown) {
      setDogovorsDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setDogovorsDownloadingId(null);
    }
  }, []);

  useEffect(() => {
    if (tab !== "customers") return;
    setAutoRegisterLoading(true);
    const params = new URLSearchParams();
    if (customersSearch.trim().length >= 2) params.set("q", customersSearch.trim());
    fetch(`/api/admin-auto-register-candidates?${params.toString()}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (data?.error) throw new Error(String(data.error));
        setAutoRegisterCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
        setAutoRegisterStats(data?.stats || null);
        setAutoRegisterAutoModeEnabled(Boolean(data?.auto_mode_enabled));
        setAutoRegisterResult(null);
      })
      .catch((e: unknown) => {
        setAutoRegisterCandidates([]);
        setAutoRegisterStats(null);
        setError((e as Error)?.message || "Ошибка загрузки кандидатов");
      })
      .finally(() => setAutoRegisterLoading(false));
  }, [tab, customersSearch, adminToken, autoRegisterFetchTrigger]);

  useEffect(() => {
    if (tab === "customers") fetchUsers();
  }, [tab, fetchUsers]);

  /** Выгрузка заказчиков в CSV (только для суперадмина). Экспортирует те же данные, что отображаются в таблице (с учётом фильтра и сортировки). */
  const handleExportCustomers = useCallback(() => {
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
    const escapeCsv = (s: string) => {
      const t = String(s ?? "").trim();
      if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
      return t;
    };
    const header = "ИНН;Наименование;Email";
    const rows = sorted.map((c) => [c.inn, c.customer_name || "", c.email || ""].map(escapeCsv).join(";"));
    const csv = "\uFEFF" + header + "\r\n" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `заказчики_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customersList, customersShowOnlyWithoutEmail, customersSortBy, customersSortOrder]);

  const fetchPresets = useCallback(() => {
    setPresetsLoading(true);
    fetch("/api/admin-presets", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { presets?: PermissionPreset[] }) => {
        setPermissionPresets(Array.isArray(data.presets) ? data.presets : []);
      })
      .catch(() => setPermissionPresets([]))
      .finally(() => setPresetsLoading(false));
  }, [adminToken]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const fetchPaymentCalendar = useCallback(() => {
    if (!adminToken) return;
    setPaymentCalendarLoading(true);
    fetch("/api/admin-payment-calendar", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { items?: { inn: string; customer_name: string | null; days_to_pay: number; payment_weekdays?: number[] }[] }) => {
        setPaymentCalendarItems((data.items || []).map((r) => ({
          inn: r.inn,
          customer_name: r.customer_name,
          days_to_pay: r.days_to_pay,
          payment_weekdays: Array.isArray(r.payment_weekdays) ? r.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [],
        })));
      })
      .catch(() => setPaymentCalendarItems([]))
      .finally(() => setPaymentCalendarLoading(false));
  }, [adminToken]);

  const fetchPaymentCalendarCustomers = useCallback(() => {
    if (!adminToken) return;
    setPaymentCalendarCustomerLoading(true);
    const q = paymentCalendarSearch.trim();
    const url = q.length >= 2
      ? `/api/admin-customers-search?q=${encodeURIComponent(q)}&limit=500`
      : `/api/admin-customers-search?q=&limit=500`;
    fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { customers?: { inn: string; customer_name: string; email: string }[] }) => {
        setPaymentCalendarCustomerList(data.customers || []);
      })
      .catch(() => setPaymentCalendarCustomerList([]))
      .finally(() => setPaymentCalendarCustomerLoading(false));
  }, [adminToken, paymentCalendarSearch]);

  useEffect(() => {
    if (tab === "payment_calendar" && isSuperAdmin) {
      fetchPaymentCalendar();
    }
  }, [tab, isSuperAdmin, fetchPaymentCalendar]);

  useEffect(() => {
    if (tab === "payment_calendar" && adminToken) {
      fetchPaymentCalendarCustomers();
    }
  }, [tab, adminToken, fetchPaymentCalendarCustomers]);

  const fetchWorkSchedule = useCallback(() => {
    if (!adminToken) return;
    setWorkScheduleLoading(true);
    fetch("/api/admin-work-schedule", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { items?: { inn: string; customer_name: string | null; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
        setWorkScheduleItems((data.items || []).map((r) => ({
          inn: r.inn,
          customer_name: r.customer_name,
          days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
          work_start: String(r.work_start || "09:00").slice(0, 5),
          work_end: String(r.work_end || "18:00").slice(0, 5),
        })));
      })
      .catch(() => setWorkScheduleItems([]))
      .finally(() => setWorkScheduleLoading(false));
  }, [adminToken]);

  const fetchWorkScheduleCustomers = useCallback(() => {
    if (!adminToken) return;
    setWorkScheduleCustomerLoading(true);
    const q = workScheduleSearch.trim();
    const url = q.length >= 2
      ? `/api/admin-customers-search?q=${encodeURIComponent(q)}&limit=500`
      : `/api/admin-customers-search?q=&limit=500`;
    fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => res.json())
      .then((data: { customers?: { inn: string; customer_name: string; email: string }[] }) => {
        setWorkScheduleCustomerList(data.customers || []);
      })
      .catch(() => setWorkScheduleCustomerList([]))
      .finally(() => setWorkScheduleCustomerLoading(false));
  }, [adminToken, workScheduleSearch]);

  useEffect(() => {
    if (tab === "work_schedule" && isSuperAdmin) {
      fetchWorkSchedule();
    }
  }, [tab, isSuperAdmin, fetchWorkSchedule]);

  useEffect(() => {
    if (tab === "work_schedule" && adminToken) {
      fetchWorkScheduleCustomers();
    }
  }, [tab, adminToken, fetchWorkScheduleCustomers]);

  useEffect(() => {
    if (!adminToken) {
      setAdminMeLoaded(false);
      return;
    }
    setAdminMeLoaded(false);
    fetch("/api/admin-me", { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { isSuperAdmin?: boolean }) => {
        setIsSuperAdmin(data?.isSuperAdmin === true);
        setAdminMeLoaded(true);
      })
      .catch(() => setAdminMeLoaded(true));
  }, [adminToken]);

  useEffect(() => {
    if (!adminMeLoaded) return;
    if (!isSuperAdmin && (tab === "employee_directory" || tab === "subdivisions" || tab === "presets" || tab === "payment_calendar" || tab === "work_schedule" || tab === "timesheet" || tab === "expense_requests" || tab === "accounting" || tab === "claims" || tab === "pnl")) setTab("users");
    if (isSuperAdmin && tab === "claims") {
      setTab("accounting");
      setAccountingSubsection("claims");
    }
  }, [adminMeLoaded, isSuperAdmin, tab]);

  const reloadAllExpenseRequests = useCallback(async () => {
    const fromLocalStorage = () => {
      const prefix = "haulz.expense_requests.";
      const all: (ExpenseRequestItem & { login: string })[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const login = k.slice(prefix.length);
        try {
          const items = JSON.parse(localStorage.getItem(k) ?? "[]") as ExpenseRequestItem[];
          if (Array.isArray(items)) items.forEach((r) => { if (r && r.createdAt) all.push({ ...r, login }); });
        } catch { /* skip */ }
      }
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setAdminExpenseRequests(all);
    };
    if (adminToken && isSuperAdmin) {
      try {
        const res = await fetch("/api/admin-expense-requests", { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Ошибка загрузки заявок на расходы");
        if (Array.isArray(data?.items)) {
          setAdminExpenseRequests(data.items);
          return;
        }
        setAdminExpenseRequests([]);
        return;
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка загрузки заявок на расходы");
      }
    }
    fromLocalStorage();
  }, [adminToken, isSuperAdmin]);

  useEffect(() => {
    if ((tab === "expense_requests" || tab === "accounting") && isSuperAdmin) reloadAllExpenseRequests();
  }, [tab, isSuperAdmin, reloadAllExpenseRequests]);

  const reloadSverkiRequests = useCallback(async () => {
    if (!adminToken || !isSuperAdmin) {
      setSverkiRequests([]);
      return;
    }
    setSverkiRequestsLoading(true);
    try {
      const res = await fetch("/api/admin-sverki-requests", { headers: { Authorization: `Bearer ${adminToken}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки заявок актов сверки");
      setSverkiRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch {
      setSverkiRequests([]);
    } finally {
      setSverkiRequestsLoading(false);
    }
  }, [adminToken, isSuperAdmin]);

  useEffect(() => {
    if (tab === "accounting" && isSuperAdmin) reloadSverkiRequests();
  }, [tab, isSuperAdmin, reloadSverkiRequests]);

  const reloadAdminClaims = useCallback(async () => {
    if (!adminToken || !isSuperAdmin) {
      setAdminClaims([]);
      return;
    }
    setAdminClaimsLoading(true);
    try {
      const params = new URLSearchParams();
      const viewStatus = adminClaimsView === "new"
        ? "new"
        : adminClaimsView === "in_progress"
          ? "in_progress"
          : "";
      const effectiveStatus = adminClaimsStatusFilter || viewStatus;
      if (effectiveStatus) params.set("status", effectiveStatus);
      if (adminClaimsSearch.trim()) params.set("q", adminClaimsSearch.trim());
      const res = await fetch(`/api/admin-claims${params.toString() ? `?${params.toString()}` : ""}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки претензий");
      setAdminClaims(Array.isArray(data?.claims) ? data.claims : []);
      setAdminClaimsKpi(data?.kpi || null);
      setAdminClaimsChart(Array.isArray(data?.chart) ? data.chart : []);
    } catch {
      setAdminClaims([]);
      setAdminClaimsKpi(null);
      setAdminClaimsChart([]);
    } finally {
      setAdminClaimsLoading(false);
    }
  }, [adminToken, isSuperAdmin, adminClaimsStatusFilter, adminClaimsSearch, adminClaimsView]);

  useEffect(() => {
    if ((tab === "accounting" || tab === "claims") && isSuperAdmin) reloadAdminClaims();
  }, [tab, isSuperAdmin, reloadAdminClaims]);

  const loadPnlExpenseCategoryLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/pnl-expense-categories");
      const data = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(data)) return;
      setPnlExpenseCategoryLinks(
        data.map((row: any) => ({
          expenseCategoryId: row?.expenseCategoryId ? String(row.expenseCategoryId) : null,
          name: row?.name ? String(row.name) : null,
          department: String(row?.department || ""),
          logisticsStage: row?.logisticsStage ? String(row.logisticsStage) : null,
        }))
      );
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if ((tab === "expense_requests" || tab === "accounting" || tab === "claims") && isSuperAdmin) loadPnlExpenseCategoryLinks();
  }, [tab, isSuperAdmin, loadPnlExpenseCategoryLinks]);

  const markSverkiRequestAsSent = useCallback(async (id: number) => {
    if (!adminToken) return;
    setSverkiRequestsUpdatingId(id);
    try {
      const res = await fetch("/api/admin-sverki-requests-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id, status: "edo_sent" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка обновления статуса заявки");
      setSverkiRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "edo_sent", updatedAt: new Date().toISOString() } : r)));
    } catch (e: any) {
      setError(e?.message || "Ошибка обновления статуса заявки");
    } finally {
      setSverkiRequestsUpdatingId(null);
    }
  }, [adminToken]);
  const deleteSverkiRequest = useCallback(async (id: number) => {
    if (!adminToken) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Удалить заявку акта сверки? Действие нельзя отменить.") : true;
    if (!confirmed) return;
    setSverkiRequestsUpdatingId(id);
    try {
      const res = await fetch("/api/admin-sverki-requests-update", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка удаления заявки");
      setSverkiRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || "Ошибка удаления заявки");
    } finally {
      setSverkiRequestsUpdatingId(null);
    }
  }, [adminToken]);

  const updateAdminClaimStatus = useCallback(async (
    id: number,
    status: string,
    approvedAmount?: number | null,
    extras?: { expertLogin?: string; managerNote?: string; leaderComment?: string; accountantLogin?: string; internalComment?: string }
  ) => {
    if (!adminToken) return;
    setAdminClaimsUpdatingId(id);
    try {
      const res = await fetch("/api/admin-claim-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          claimId: id,
          status,
          approvedAmount: approvedAmount != null ? approvedAmount : undefined,
          expertLogin: extras?.expertLogin || undefined,
          managerNote: extras?.managerNote || undefined,
          leaderComment: extras?.leaderComment || undefined,
          accountantLogin: extras?.accountantLogin || undefined,
          internalComment: extras?.internalComment || undefined,
          enqueuePush: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка обновления претензии");
      reloadAdminClaims();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка обновления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims]);
  const deleteAdminClaim = useCallback(async (id: number) => {
    if (!adminToken) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Удалить претензию? Действие нельзя отменить.") : true;
    if (!confirmed) return;
    setAdminClaimsUpdatingId(id);
    try {
      const res = await fetch("/api/admin-claim-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action: "delete",
          claimId: id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка удаления претензии");
      if (adminClaimDetailId === id) setAdminClaimDetailId(null);
      reloadAdminClaims();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка удаления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims, adminClaimDetailId]);
  const downloadClaimCargoDoc = useCallback(async (method: "ЭР" | "АПП") => {
    const cargoNumber = String(adminClaimDetail?.claim?.cargoNumber || "").trim();
    if (!cargoNumber) {
      setAdminClaimDocError("Не указан номер перевозки");
      return;
    }
    setAdminClaimDocError("");
    setAdminClaimDocDownloading(method);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metod: method,
          number: cargoNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Не удалось получить ${method}`);
      if (!data?.data) throw new Error(`Документ ${method} не найден`);

      const binary = atob(String(data.data));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = String(data?.name || `${method}_${cargoNumber}.pdf`);
      a.click();
      URL.revokeObjectURL(href);
    } catch (e: unknown) {
      setAdminClaimDocError((e as Error)?.message || `Ошибка скачивания ${method}`);
    } finally {
      setAdminClaimDocDownloading("");
    }
  }, [adminClaimDetail?.claim?.cargoNumber]);
  const uploadAdminClaimDocuments = useCallback(async () => {
    if (!adminToken || !adminClaimDetail?.claim?.id) return;
    const video = adminClaimAttachVideoLink.trim();
    if (adminClaimAttachPhotoFiles.length === 0 && adminClaimAttachDocumentFiles.length === 0 && !video) {
      setAdminClaimAttachError("Добавьте хотя бы один файл или видео-ссылку");
      return;
    }
    setAdminClaimAttachSubmitting(true);
    setAdminClaimAttachError("");
    try {
      const photosPayload = await Promise.all(
        adminClaimAttachPhotoFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          caption: "",
          base64: await fileToBase64(file),
        }))
      );
      const documentsPayload = await Promise.all(
        adminClaimAttachDocumentFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          docType: "other" as const,
          base64: await fileToBase64(file),
        }))
      );
      const videoLinksPayload = video ? [{ url: video, title: adminClaimAttachRole === "leader" ? "Видео от руководителя" : "Видео от менеджера" }] : [];
      const res = await fetch("/api/admin-claim-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action: "upload_documents",
          claimId: Number(adminClaimDetail.claim.id),
          actorRole: adminClaimAttachRole,
          photos: photosPayload,
          documents: documentsPayload,
          videoLinks: videoLinksPayload,
          enqueuePush: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка прикрепления файлов");
      setAdminClaimAttachPhotoFiles([]);
      setAdminClaimAttachDocumentFiles([]);
      setAdminClaimAttachVideoLink("");
      setAdminClaimDetailReloadTick((v) => v + 1);
    } catch (e: unknown) {
      setAdminClaimAttachError((e as Error)?.message || "Ошибка прикрепления файлов");
    } finally {
      setAdminClaimAttachSubmitting(false);
    }
  }, [
    adminToken,
    adminClaimDetail?.claim?.id,
    adminClaimAttachRole,
    adminClaimAttachPhotoFiles,
    adminClaimAttachDocumentFiles,
    adminClaimAttachVideoLink,
  ]);

  useEffect(() => {
    if (!adminClaimDetailId || !adminToken) {
      setAdminClaimDetail(null);
      setAdminClaimMaxDamageAmount(null);
      setAdminClaimMaxDamageLoading(false);
      return;
    }
    let cancelled = false;
    setAdminClaimDetailLoading(true);
    fetch(`/api/admin-claim-detail?id=${adminClaimDetailId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        setAdminClaimDetail(data || null);
        const claim = data?.claim || {};
        setAdminClaimNoteDraft(String(claim?.managerNote || ""));
        setAdminLeaderCommentDraft(String(claim?.leaderComment || ""));
        setAdminClaimApprovedAmountDraft(claim?.approvedAmount != null ? String(claim.approvedAmount) : "");
        setAdminDelegateOpen(false);
        setAdminDelegateLogin(String(claim?.expertLogin || ""));
        setAdminDelegateComment("");
        setAdminRequestDocsOpen(false);
        setAdminRequestDocUPD(false);
        setAdminRequestDocTTN(false);
        setAdminRequestDocsComment("");
        setAdminClaimAttachRole("manager");
        setAdminClaimAttachPhotoFiles([]);
        setAdminClaimAttachDocumentFiles([]);
        setAdminClaimAttachVideoLink("");
        setAdminClaimAttachError("");
        setAdminClaimDocError("");
        setAdminClaimDocDownloading("");
        if (claim?.id && String(claim?.status || "") === "new") {
          setAdminClaimDetail((prev: any) => ({ ...prev, claim: { ...prev?.claim, status: "in_progress" } }));
          updateAdminClaimStatus(
            Number(claim.id),
            "in_progress",
            Number(claim?.approvedAmount || 0),
            { expertLogin: String(claim?.expertLogin || "").trim(), managerNote: String(claim?.managerNote || "").trim() }
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAdminClaimDetail(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAdminClaimDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClaimDetailId, adminToken, updateAdminClaimStatus, adminClaimDetailReloadTick]);

  useEffect(() => {
    const cargoNumber = String(adminClaimDetail?.claim?.cargoNumber || "").trim();
    const selectedPlacesRaw = Array.isArray(adminClaimDetail?.customerPayload?.selectedPlaces)
      ? adminClaimDetail.customerPayload.selectedPlaces
      : [];
    const selectedPlaceKeys = selectedPlacesRaw
      .map((value: unknown) => normalizePlaceKey(extractPlaceNumberFromLabel(value)))
      .filter(Boolean);
    if (!cargoNumber || selectedPlaceKeys.length === 0) {
      setAdminClaimMaxDamageAmount(0);
      setAdminClaimMaxDamageLoading(false);
      return;
    }
    let cancelled = false;
    setAdminClaimMaxDamageLoading(true);
    fetch("/api/getperevozka", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: cargoNumber }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.error || `Ошибка ${res.status}`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const rows = extractPerevozkaNomenclatureRows(data);
        const selectedSet = new Set(selectedPlaceKeys);
        const rootTariff = pickFirstNumericField(data, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
        let selectedCostSum = 0;
        let selectedPaidWeightSum = 0;
        let matchedTariff = rootTariff;
        rows.forEach((row: any) => {
          const placeRaw = row?.Package
            ?? row?.package
            ?? row?.Barcode
            ?? row?.barcode
            ?? row?.Штрихкод
            ?? row?.НомерМеста
            ?? row?.PlaceNumber;
          const placeKey = normalizePlaceKey(placeRaw);
          if (!placeKey || !selectedSet.has(placeKey)) return;
          const placeCost = pickFirstNumericField(row, [
            "DeclaredCost",
            "declaredCost",
            "DeclaredValue",
            "declaredValue",
            "ОбъявленнаяСтоимость",
            "ОбъявлСтоимость",
            "Стоимость",
            "Cost",
            "Price",
          ]);
          const paidWeight = pickFirstNumericField(row, [
            "PaidWeight",
            "paidWeight",
            "ChargeableWeight",
            "chargeableWeight",
            "ПлатныйВес",
            "ВесПлатный",
            "WeightPaid",
            "weightPaid",
          ]);
          const rowTariff = pickFirstNumericField(row, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
          if (rowTariff > 0) matchedTariff = rowTariff;
          selectedCostSum += placeCost;
          selectedPaidWeightSum += paidWeight;
        });
        const total = selectedCostSum + selectedPaidWeightSum * matchedTariff;
        setAdminClaimMaxDamageAmount(Number.isFinite(total) ? Math.max(0, total) : 0);
      })
      .catch(() => {
        if (cancelled) return;
        setAdminClaimMaxDamageAmount(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAdminClaimMaxDamageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClaimDetail?.claim?.cargoNumber, adminClaimDetail?.customerPayload?.selectedPlaces]);

  const updateExpenseStatus = useCallback(async (itemId: string, itemLogin: string, newStatus: string, rejectReason?: string, fullItem?: ExpenseRequestItem & { login: string }) => {
    const storageKey = `haulz.expense_requests.${itemLogin}`;
    const updateLocal = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const items = JSON.parse(raw) as ExpenseRequestItem[];
        if (!Array.isArray(items)) return;
        const updated = items.map((r) =>
          r.id === itemId ? { ...r, status: newStatus as any, ...(rejectReason !== undefined ? { rejectionReason: rejectReason } : {}) } : r
        );
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch { /* skip */ }
    };
    if (adminToken) {
      try {
        let res = await fetch("/api/admin-expense-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ uid: itemId, status: newStatus, rejection_reason: rejectReason }),
        });
        if (res.status === 404 && fullItem) {
          await fetch("/api/expense-requests-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fullItem, status: newStatus, login: itemLogin }),
          });
          res = await fetch("/api/admin-expense-requests", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ uid: itemId, status: newStatus, rejection_reason: rejectReason }),
          });
        }
        if (res.ok) {
          setError(null);
          updateLocal();
          reloadAllExpenseRequests();
          return;
        }
        const errData = await res.json().catch(() => ({}));
        const detail = errData?.details ? `: ${errData.details}` : "";
        setError(String(errData?.error || `Ошибка обновления статуса (${res.status})`) + detail);
      } catch (e) {
        setError((e as Error)?.message || "Ошибка обновления статуса заявки");
      }
    }
    updateLocal();
    reloadAllExpenseRequests();
  }, [adminToken, reloadAllExpenseRequests]);

  const deleteExpenseRequest = useCallback(async (itemId: string, itemLogin: string) => {
    const storageKey = `haulz.expense_requests.${itemLogin}`;
    const updateLocal = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const items = JSON.parse(raw) as ExpenseRequestItem[];
        const updated = items.filter((r) => r.id !== itemId);
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch { /* skip */ }
    };
    if (adminToken) {
      try {
        const res = await fetch(`/api/admin-expense-requests?uid=${encodeURIComponent(itemId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          updateLocal();
          reloadAllExpenseRequests();
          return;
        }
      } catch { /* fallback */ }
    }
    updateLocal();
    reloadAllExpenseRequests();
  }, [adminToken, reloadAllExpenseRequests]);

  const CATEGORIES_LIST = [{ id: "fuel", name: "Топливо" }, { id: "repair", name: "Ремонт и обслуживание" }, { id: "spare_parts", name: "Запасные части" }, { id: "salary", name: "Зарплата" }, { id: "office", name: "Офис" }, { id: "rent", name: "Аренда" }, { id: "insurance", name: "Страхование" }, { id: "mainline", name: "Магистраль" }, { id: "pickup_logistics", name: "Заборная логистика" }, { id: "other", name: "Прочее" }];

  const saveExpenseEdit = useCallback(async (itemId: string, itemLogin: string) => {
    const num = parseFloat(expenseEditAmount.replace(",", "."));
    const catObj = CATEGORIES_LIST.find((c) => c.id === expenseEditCategory);
    const payload = {
      uid: itemId,
      docNumber: expenseEditDocNumber,
      docDate: expenseEditDocDate || null,
      period: expenseEditPeriod,
      department: expenseEditDepartment,
      categoryId: catObj?.id ?? expenseEditCategory,
      amount: Number.isFinite(num) && num > 0 ? num : undefined,
      vatRate: expenseEditVatRate,
      comment: expenseEditComment,
      vehicleOrEmployee: expenseEditVehicle,
      employeeName: expenseEditEmployee,
      supplierName: expenseEditSupplierName,
      supplierInn: expenseEditSupplierInn,
    };
    if (adminToken) {
      try {
        const res = await fetch("/api/admin-expense-requests", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setExpenseEditId(null);
          reloadAllExpenseRequests();
          return;
        }
        const errData = await res.json().catch(() => ({}));
        const detail = errData?.details ? `: ${errData.details}` : "";
        setError(String(errData?.error || "Ошибка сохранения заявки") + detail);
      } catch (e) {
        setError((e as Error)?.message || "Ошибка сохранения заявки");
      }
    }
    const storageKey = `haulz.expense_requests.${itemLogin}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const items = JSON.parse(raw) as ExpenseRequestItem[];
      if (!Array.isArray(items)) return;
      const updated = items.map((r) =>
        r.id === itemId ? {
          ...r,
          docNumber: expenseEditDocNumber,
          docDate: expenseEditDocDate,
          period: expenseEditPeriod,
          department: expenseEditDepartment || r.department,
          ...(catObj ? { categoryId: catObj.id, categoryName: catObj.name } : {}),
          ...(Number.isFinite(num) && num > 0 ? { amount: num } : {}),
          vatRate: expenseEditVatRate,
          comment: expenseEditComment,
          vehicleOrEmployee: expenseEditVehicle,
          employeeName: expenseEditEmployee,
          supplierName: expenseEditSupplierName,
          supplierInn: expenseEditSupplierInn,
        } : r
      );
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setExpenseEditId(null);
      reloadAllExpenseRequests();
    } catch { /* skip */ }
  }, [adminToken, expenseEditDocNumber, expenseEditDocDate, expenseEditPeriod, expenseEditDepartment, expenseEditCategory, expenseEditAmount, expenseEditVatRate, expenseEditComment, expenseEditVehicle, expenseEditEmployee, expenseEditSupplierName, expenseEditSupplierInn, reloadAllExpenseRequests]);

  const fetchEmployeeDirectory = useCallback(async (monthForTimesheet?: string) => {
    if (!adminToken || !isSuperAdmin) return;
    setEmployeeDirectoryLoading(true);
    try {
      const monthQuery = monthForTimesheet && /^\d{4}-\d{2}$/.test(monthForTimesheet)
        ? `?month=${encodeURIComponent(monthForTimesheet)}`
        : "";
      const res = await fetch(`/api/admin-employee-directory${monthQuery}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onLogoutRef.current?.("expired");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки справочника сотрудников");
      setEmployeeDirectoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки справочника сотрудников");
      setEmployeeDirectoryItems([]);
    } finally {
      setEmployeeDirectoryLoading(false);
    }
  }, [adminToken, isSuperAdmin]);

  const fetchEmployeeDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/pnl-subdivisions");
      const data = await res.json().catch(() => []);
      const names = Array.isArray(data) ? data.map((s: { name?: string }) => s?.name ?? "").filter(Boolean) : [];
      setEmployeeDepartments(names);
      setEmployeeDirectoryDepartment((prev) => {
        if (prev && names.includes(prev)) return prev;
        return names[0] ?? "";
      });
    } catch {
      setEmployeeDepartments([]);
    }
  }, []);

  const fetchTimesheetEntries = useCallback(async () => {
    if (!adminToken || !isSuperAdmin || !/^\d{4}-\d{2}$/.test(timesheetMonth)) return;
    try {
      const res = await fetch(`/api/admin-timesheet?month=${encodeURIComponent(timesheetMonth)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onLogoutRef.current?.("expired");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки табеля");
      setTimesheetHours(data?.entries && typeof data.entries === "object" ? data.entries : {});
      setTimesheetPaymentMarks(data?.paymentMarks && typeof data.paymentMarks === "object" ? data.paymentMarks : {});
      setTimesheetShiftRateOverrides(data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object" ? data.shiftRateOverrides : {});
      setTimesheetPayoutsByEmployee(data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object" ? data.payoutsByEmployee : {});
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки табеля");
      setTimesheetHours({});
      setTimesheetPaymentMarks({});
      setTimesheetShiftRateOverrides({});
      setTimesheetPayoutsByEmployee({});
    }
  }, [adminToken, isSuperAdmin, timesheetMonth]);

  const saveTimesheetCell = useCallback(
    async (employeeId: number, dateIso: string, value: string) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
            date: dateIso,
            value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка сохранения табеля");
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка сохранения табеля");
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth]
  );
  const saveTimesheetPaymentMark = useCallback(
    async (employeeId: number, dateIso: string, paid: boolean) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
            date: dateIso,
            paid,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка сохранения оплаты");
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка сохранения оплаты");
        await fetchTimesheetEntries();
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
  );
  const saveTimesheetShiftRate = useCallback(
    async (employeeId: number, dateIso: string, shiftRate: string) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
            date: dateIso,
            shiftRate,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка сохранения стоимости смены");
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка сохранения стоимости смены");
        await fetchTimesheetEntries();
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
  );
  const createTimesheetPayout = useCallback(
    async (employeeId: number) => {
      if (!adminToken || !isSuperAdmin) return;
      setTimesheetPayoutSavingEmployeeId(employeeId);
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка проведения выплаты");
        await fetchTimesheetEntries();
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка проведения выплаты");
      } finally {
        setTimesheetPayoutSavingEmployeeId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
  );
  const updateTimesheetPayout = useCallback(
    async (employeeId: number, payoutId: number, payoutDate: string, amountRaw: string) => {
      if (!adminToken || !isSuperAdmin) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payoutDate || "").trim())) {
        setError("Дата выплаты должна быть в формате YYYY-MM-DD");
        return;
      }
      const amount = Number(String(amountRaw || "").replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0) {
        setError("Сумма выплаты должна быть числом не меньше 0");
        return;
      }
      setTimesheetPayoutActionLoadingId(payoutId);
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
            payoutId,
            payoutDate,
            amount,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка изменения выплаты");
        await fetchTimesheetEntries();
        setTimesheetPayoutEditingId(null);
        setTimesheetPayoutEditingEmployeeId(null);
        setTimesheetPayoutEditDate("");
        setTimesheetPayoutEditAmount("");
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка изменения выплаты");
      } finally {
        setTimesheetPayoutActionLoadingId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
  );
  const deleteTimesheetPayout = useCallback(
    async (employeeId: number, payoutId: number) => {
      if (!adminToken || !isSuperAdmin) return;
      if (!window.confirm("Удалить выплату? Действие нельзя отменить.")) return;
      setTimesheetPayoutActionLoadingId(payoutId);
      try {
        const res = await fetch("/api/admin-timesheet", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            month: timesheetMonth,
            employeeId,
            payoutId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        if (!res.ok) throw new Error(data?.error || "Ошибка удаления выплаты");
        await fetchTimesheetEntries();
        if (timesheetPayoutEditingId === payoutId) {
          setTimesheetPayoutEditingId(null);
          setTimesheetPayoutEditingEmployeeId(null);
          setTimesheetPayoutEditDate("");
          setTimesheetPayoutEditAmount("");
        }
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка удаления выплаты");
      } finally {
        setTimesheetPayoutActionLoadingId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, timesheetPayoutEditingId]
  );

  useEffect(() => {
    if (tab === "employee_directory" && isSuperAdmin) {
      fetchEmployeeDirectory();
      fetchEmployeeDepartments();
    }
    if ((tab === "expense_requests" || tab === "accounting" || tab === "claims") && isSuperAdmin) {
      fetchEmployeeDirectory();
    }
  }, [tab, isSuperAdmin, fetchEmployeeDirectory, fetchEmployeeDepartments]);

  useEffect(() => {
    if (tab === "timesheet" && isSuperAdmin) {
      fetchEmployeeDirectory(timesheetMonth);
    }
  }, [tab, isSuperAdmin, fetchEmployeeDirectory, timesheetMonth]);

  useEffect(() => {
    if (tab === "timesheet" && isSuperAdmin) {
      fetchTimesheetEntries();
    }
  }, [tab, isSuperAdmin, fetchTimesheetEntries]);

  useEffect(() => {
    if (tab !== "users") setShowAddUserForm(false);
  }, [tab]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormResult(null);
    setError(null);
    const normalizedEmail = formEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Введите корректный email");
      setFormSubmitting(false);
      return;
    }
    if (users.some((u) => String(u.login || "").trim().toLowerCase() === normalizedEmail)) {
      setError("Пользователь с таким email уже существует");
      setFormSubmitting(false);
      return;
    }
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
      login: normalizedEmail,
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
      setShowAddUserForm(false);
    } catch (e: unknown) {
      setError((e as Error).message);
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
  }, [selectedUserIds, bulkPermissions, bulkFinancial, bulkAccessAllInns, adminToken, fetchUsers]);

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
    if (!editorAccessAllInns && !editorPermissions.service_mode && editorCustomers.length === 0) {
      setEditorError("Конфликт: нет заказчиков и выключен служебный режим. Назначьте заказчика или включите служебный режим.");
      return;
    }
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

  useEffect(() => {
    if (!selectedUser) {
      setUserChangeEntries([]);
      setUserChangeQuery("");
      return;
    }
    const login = String(selectedUser.login || "").trim();
    setUserChangeQuery(login);
    setUserChangeLoading(true);
    fetch(`/api/admin-audit-log?q=${encodeURIComponent(login)}&limit=30`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        setUserChangeEntries(entries);
      })
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
  const isDirectoryTab = tab === "users" || tab === "customers" || tab === "suppliers" || tab === "tariffs" || tab === "sverki" || tab === "dogovors" || tab === "employee_directory" || tab === "subdivisions" || tab === "presets";

  return (
    <div className={theme === "light" ? "light-mode w-full" : "w-full"}>
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.75rem">
          <Button type="button" className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад в приложение">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
        </Flex>
        <Flex align="center" gap="0.5rem">
          <Button
            type="button"
            className="filter-button"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            style={{ padding: "0.5rem" }}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {onLogout && (
            <Button type="button" className="filter-button" onClick={onLogout} style={{ padding: "0.5rem 0.75rem" }} aria-label="Выйти из админки">
              <LogOut className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Выход
            </Button>
          )}
        </Flex>
      </Flex>

      <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button
          className="filter-button"
          style={{ background: isDirectoryTab ? "var(--color-primary-blue)" : undefined, color: isDirectoryTab ? "white" : undefined }}
          onClick={() => setTab("users")}
        >
          <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Справочники
        </Button>
        <Button
          className="filter-button"
          style={{ background: isJournalTab ? "var(--color-primary-blue)" : undefined, color: isJournalTab ? "white" : undefined }}
          onClick={() => setTab("audit")}
        >
          <History className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Журналы
        </Button>
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "payment_calendar" ? "var(--color-primary-blue)" : undefined, color: tab === "payment_calendar" ? "white" : undefined }}
            onClick={() => setTab("payment_calendar")}
          >
            <Calendar className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Платёжный календарь
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "work_schedule" ? "var(--color-primary-blue)" : undefined, color: tab === "work_schedule" ? "white" : undefined }}
            onClick={() => setTab("work_schedule")}
          >
            <Clock className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            График работы
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "timesheet" ? "var(--color-primary-blue)" : undefined, color: tab === "timesheet" ? "white" : undefined }}
            onClick={() => setTab("timesheet")}
          >
            <Calendar className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Табель учета рабочего времени
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "expense_requests" ? "var(--color-primary-blue)" : undefined, color: tab === "expense_requests" ? "white" : undefined }}
            onClick={() => setTab("expense_requests")}
          >
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Заявки на расходы
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "accounting" ? "#dc2626" : undefined, color: tab === "accounting" ? "white" : undefined }}
            onClick={() => setTab("accounting")}
          >
            <Calculator className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Бухгалтерия
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "accounting" && accountingSubsection === "claims" ? "var(--color-primary-blue)" : undefined, color: tab === "accounting" && accountingSubsection === "claims" ? "white" : undefined }}
            onClick={() => { setTab("accounting"); setAccountingSubsection("claims"); }}
          >
            <FileText className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Претензии
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={{ background: tab === "pnl" ? "#7c3aed" : undefined, color: tab === "pnl" ? "white" : undefined }}
            onClick={() => setTab("pnl")}
          >
            <BarChart3 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            PNL
          </Button>
        )}
      </Flex>

      {isDirectoryTab && (
        <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          <Button
            className="filter-button"
            style={{ background: tab === "users" ? "var(--color-primary-blue)" : undefined, color: tab === "users" ? "white" : undefined }}
            onClick={() => setTab("users")}
          >
            <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник пользователей
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
            style={{ background: tab === "suppliers" ? "var(--color-primary-blue)" : undefined, color: tab === "suppliers" ? "white" : undefined }}
            onClick={() => setTab("suppliers")}
          >
            <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник поставщиков
          </Button>
          {isSuperAdmin && (
            <Button
              className="filter-button"
              style={{ background: tab === "employee_directory" ? "var(--color-primary-blue)" : undefined, color: tab === "employee_directory" ? "white" : undefined }}
              onClick={() => setTab("employee_directory")}
            >
              <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Справочник сотрудников
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              className="filter-button"
              style={{ background: tab === "subdivisions" ? "var(--color-primary-blue)" : undefined, color: tab === "subdivisions" ? "white" : undefined }}
              onClick={() => setTab("subdivisions")}
            >
              <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Справочник подразделений
            </Button>
          )}
          <Button
            className="filter-button"
            style={{ background: tab === "tariffs" ? "var(--color-primary-blue)" : undefined, color: tab === "tariffs" ? "white" : undefined }}
            onClick={() => setTab("tariffs")}
          >
            <Receipt className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Тарифы
          </Button>
          <Button
            className="filter-button"
            style={{ background: tab === "sverki" ? "var(--color-primary-blue)" : undefined, color: tab === "sverki" ? "white" : undefined }}
            onClick={() => setTab("sverki")}
          >
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Акты сверок
          </Button>
          <Button
            className="filter-button"
            style={{ background: tab === "dogovors" ? "var(--color-primary-blue)" : undefined, color: tab === "dogovors" ? "white" : undefined }}
            onClick={() => setTab("dogovors")}
          >
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Договоры
          </Button>
          {isSuperAdmin && (
            <Button
              className="filter-button"
              style={{ background: tab === "presets" ? "var(--color-primary-blue)" : undefined, color: tab === "presets" ? "white" : undefined }}
              onClick={() => setTab("presets")}
            >
              <Layers className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Пресеты ролей
            </Button>
          )}
        </Flex>
      )}

      {isJournalTab && (
        <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
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
            style={{ background: tab === "logs" ? "var(--color-primary-blue)" : undefined, color: tab === "logs" ? "white" : undefined }}
            onClick={() => setTab("logs")}
          >
            <AlertCircle className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Журнал логов
          </Button>
          <Button
            className="filter-button"
            style={{ background: tab === "integrations" ? "var(--color-primary-blue)" : undefined, color: tab === "integrations" ? "white" : undefined }}
            onClick={() => setTab("integrations")}
          >
            <Activity className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Здоровье интеграций
          </Button>
        </Flex>
      )}

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
                            return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
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
                        if (!isSuperAdmin && (key === "cms_access" || key === "service_mode" || key === "analytics")) return null;
                        const isActive = key === "__financial__" ? editorFinancial : key === "service_mode" ? (!!editorPermissions.service_mode || editorAccessAllInns) : key === "analytics" ? !!editorPermissions.analytics : !!editorPermissions[key];
                        const onClick = key === "__financial__" ? () => { setEditorSelectedPresetId(""); setEditorFinancial(!editorFinancial); } : key === "service_mode" ? () => { setEditorSelectedPresetId(""); const v = !(!!editorPermissions.service_mode || editorAccessAllInns); setEditorPermissions((p) => ({ ...p, service_mode: v })); setEditorAccessAllInns(v); } : () => handlePermissionsToggle(key);
                        const activeClass = isActive
                          ? (key === "service_mode" || key === "analytics"
                              ? "active active-warning"
                              : key === "haulz"
                                ? "active active-success"
                                : key === "eor"
                                  ? "active active-eor"
                                  : "active active-danger")
                          : "";
                        return (
                          <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>
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
                    <UserRow
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
                      if (!isSuperAdmin && (key === "cms_access" || key === "service_mode" || key === "analytics")) return null;
                      const isActive = key === "__financial__" ? bulkFinancial : key === "service_mode" ? (!!bulkPermissions.service_mode || bulkAccessAllInns) : !!bulkPermissions[key];
                      const onClick = key === "__financial__" ? () => { setBulkSelectedPresetId(""); setBulkFinancial(!bulkFinancial); } : key === "service_mode" ? () => { setBulkSelectedPresetId(""); const v = !(!!bulkPermissions.service_mode || bulkAccessAllInns); setBulkPermissions((p) => ({ ...p, service_mode: v })); setBulkAccessAllInns(v); } : () => { setBulkSelectedPresetId(""); setBulkPermissions((p) => ({ ...p, [key]: !p[key] })); };
                      const activeClass = isActive
                        ? (key === "service_mode" || key === "analytics"
                            ? "active active-warning"
                            : key === "haulz"
                              ? "active active-success"
                              : key === "eor"
                                ? "active active-eor"
                                : "active active-danger")
                        : "";
                      return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
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
              const normalizeCustomerName = (v: string) =>
                String(v || "")
                  .toLowerCase()
                  .replace(/[.,;:()"'`]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
              const qNorm = normalizeCustomerName(q);
              const qTokens = qNorm.split(" ").filter(Boolean);
              const customerNameMatchesQuery = (name: string) => {
                if (!qNorm) return true;
                const n = normalizeCustomerName(name);
                if (!n) return false;
                if (n === qNorm || n.startsWith(qNorm)) return true;
                const words = n.split(" ").filter(Boolean);
                return qTokens.every((t) => words.some((w) => w.startsWith(t)));
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
                  if (!qNorm || customerNameMatchesQuery(CUSTOMER_ALL)) addToGroup(CUSTOMER_ALL, u);
                  continue;
                }
                if (u.companies && u.companies.length > 0) {
                  for (const c of u.companies) {
                    if (!customerNameMatchesQuery(c.name || "")) continue;
                    const label = c.name?.trim() ? `${c.name} (${c.inn})` : c.inn;
                    addToGroup(label, u);
                  }
                } else if (u.inn) {
                  if (!customerNameMatchesQuery(u.company_name || "")) continue;
                  const label = u.company_name?.trim() ? `${u.company_name} (${u.inn})` : u.inn;
                  addToGroup(label, u);
                } else {
                  if (!qNorm || customerNameMatchesQuery(CUSTOMER_ALL)) addToGroup(CUSTOMER_ALL, u);
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
                            return new Date(latestLoginMs).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
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
      )}

      {tab === "users" && showAddUserForm && (
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
                  if (!isSuperAdmin && (key === "cms_access" || key === "service_mode" || key === "analytics")) return null;
                  const isActive = key === "__financial__" ? formFinancial : key === "service_mode" ? (!!formPermissions.service_mode || formAccessAllInns) : !!formPermissions[key];
                  const onClick = key === "__financial__" ? () => { setFormSelectedPresetId(""); setFormFinancial(!formFinancial); } : key === "service_mode" ? () => { setFormSelectedPresetId(""); const v = !(!!formPermissions.service_mode || formAccessAllInns); setFormPermissions((p) => ({ ...p, service_mode: v })); setFormAccessAllInns(v); if (v) clearCustomerSelection(); } : () => togglePerm(key);
                  const activeClass = isActive
                    ? (key === "service_mode" || key === "analytics"
                        ? "active active-warning"
                        : key === "haulz"
                          ? "active active-success"
                          : key === "eor"
                            ? "active active-eor"
                            : "active active-danger")
                    : "";
                  return (
                    <button type="button" key={key} className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>
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


      {tab === "customers" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник заказчиков</Typography.Body>
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
            <Button
              type="button"
              className="filter-button"
              disabled={customersLoading}
              onClick={() => setCustomersFetchTrigger((n) => n + 1)}
              style={{ marginLeft: "auto" }}
            >
              {customersLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить
            </Button>
            {isSuperAdmin && (
              <Button
                type="button"
                className="filter-button"
                disabled={customersLoading || customersList.length === 0}
                onClick={handleExportCustomers}
                aria-label="Выгрузить заказчиков в CSV"
              >
                <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
                Выгрузить
              </Button>
            )}
          </Flex>
          <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem", border: "1px dashed var(--color-border)" }}>
            <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
              <Typography.Body style={{ fontWeight: 600 }}>Dry-run: кандидаты на автосоздание</Typography.Body>
              <Flex align="center" gap="0.5rem" wrap="wrap">
                <Typography.Body style={{ fontSize: "0.8rem", color: autoRegisterAutoModeEnabled ? "var(--color-success-status)" : "var(--color-text-secondary)" }}>
                  Auto-mode: {autoRegisterAutoModeEnabled ? "включен" : "выключен (AUTO_REGISTER_FROM_CUSTOMERS=false)"}
                </Typography.Body>
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => setAutoRegisterFetchTrigger((n) => n + 1)}
                  disabled={autoRegisterLoading}
                  style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                >
                  {autoRegisterLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
                  Обновить dry-run
                </Button>
                {isSuperAdmin && autoRegisterAutoModeEnabled && autoRegisterCandidates.length > 0 && (
                  <>
                    <select
                      className="admin-form-input"
                      value={String(autoRegisterBatchSize)}
                      onChange={(e) => setAutoRegisterBatchSize(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20)))}
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                      aria-label="Размер партии авто-регистрации"
                    >
                      <option value="10">Партия: 10</option>
                      <option value="20">Партия: 20</option>
                      <option value="50">Партия: 50</option>
                      <option value="100">Партия: 100</option>
                    </select>
                    <Button
                      type="button"
                      className="button-primary"
                      onClick={async () => {
                        setAutoRegisterApplying(true);
                        setError(null);
                        setAutoRegisterResult(null);
                        try {
                          const res = await fetch("/api/admin-auto-register-candidates", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                            body: JSON.stringify({ limit: autoRegisterBatchSize }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data?.error || "Ошибка запуска авто-регистрации");
                          setAutoRegisterResult({
                            processed: Number(data?.processed || 0),
                            created: Number(data?.created || 0),
                            skipped_existing: Number(data?.skipped_existing || 0),
                            email_sent: Number(data?.email_sent || 0),
                            email_failed: Number(data?.email_failed || 0),
                            remaining_candidates: Number(data?.remaining_candidates || 0),
                            run_limit: Number(data?.run_limit || 0),
                            email_delay_ms: Number(data?.email_delay_ms || 0),
                            email_jitter_ms: Number(data?.email_jitter_ms || 0),
                          });
                          await fetchUsers();
                          setAutoRegisterFetchTrigger((n) => n + 1);
                        } catch (e: unknown) {
                          setError((e as Error)?.message || "Ошибка авто-регистрации");
                        } finally {
                          setAutoRegisterApplying(false);
                        }
                      }}
                      disabled={autoRegisterApplying}
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                    >
                      {autoRegisterApplying ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
                      Авто-режим: запустить партию
                    </Button>
                  </>
                )}
              </Flex>
            </Flex>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
              Кандидат: валидный email из справочника и отсутствие пользователя с таким login/email.
            </Typography.Body>
            {autoRegisterStats && (
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
                Всего в справочнике: {autoRegisterStats.total}; с email: {autoRegisterStats.withEmail}; валидных email: {autoRegisterStats.validEmail}; уже зарегистрированы: {autoRegisterStats.alreadyRegistered}; кандидаты: {autoRegisterCandidates.length}
              </Typography.Body>
            )}
            {autoRegisterResult && (
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
                Результат партии: обработано {autoRegisterResult.processed}, создано {autoRegisterResult.created}, пропущено {autoRegisterResult.skipped_existing}, email отправлено {autoRegisterResult.email_sent}, ошибок email {autoRegisterResult.email_failed}, осталось кандидатов {autoRegisterResult.remaining_candidates ?? 0}. Пауза между письмами: {autoRegisterResult.email_delay_ms ?? 0}ms + jitter {autoRegisterResult.email_jitter_ms ?? 0}ms.
              </Typography.Body>
            )}
            {autoRegisterLoading ? (
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Загрузка кандидатов…</Typography.Body>
            ) : autoRegisterCandidates.length === 0 ? (
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Кандидатов нет.</Typography.Body>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: "12rem", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoRegisterCandidates.slice(0, 200).map((c) => (
                      <tr key={`${c.inn}-${c.email}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{c.inn || "—"}</td>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{c.customer_name || "—"}</td>
                        <td style={{ padding: "0.35rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
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
            const customerIsRegistered = (c: { inn: string; email?: string }) => {
              const email = (c.email || "").trim().toLowerCase();
              if (!email) return false;
              return users.some((u) => u.login?.toLowerCase() === email || u.inn === c.inn || (u.companies?.some((comp) => comp.inn === c.inn) ?? false));
            };
            return (
              <>
                <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={customersSortBy === "inn" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          ИНН {customersSortBy === "inn" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("customer_name")} role="columnheader" aria-sort={customersSortBy === "customer_name" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          Наименование {customersSortBy === "customer_name" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={customersSortBy === "email" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          Email {customersSortBy === "email" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                        <th style={{ ...thStyle, cursor: "default", minWidth: "10rem" }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c) => {
                        const hasEmail = !!(c.email && String(c.email).trim());
                        const isRegistered = customerIsRegistered(c);
                        const canRegister = hasEmail && !isRegistered;
                        const isRegistering = registeringCustomerInn === c.inn;
                        return (
                          <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{c.inn}</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{c.customer_name || "—"}</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>
                              {canRegister ? (
                                <Button
                                  type="button"
                                  className="filter-button"
                                  style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                                  disabled={isRegistering}
                                  onClick={async () => {
                                    setRegisteringCustomerInn(c.inn);
                                    setError(null);
                                    try {
                                      const res = await fetch("/api/admin-register-user", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                        body: JSON.stringify({
                                          email: c.email?.trim(),
                                          inn: c.inn,
                                          company_name: c.customer_name || "",
                                          send_email: true,
                                        }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) throw new Error(data?.error || "Ошибка регистрации");
                                      await fetchUsers();
                                    } catch (e: unknown) {
                                      setError((e as Error)?.message ?? "Ошибка");
                                    } finally {
                                      setRegisteringCustomerInn(null);
                                    }
                                  }}
                                >
                                  {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : null}
                                  Зарегистрировать
                                </Button>
                              ) : isRegistered ? (
                                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>В списке пользователей</Typography.Body>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
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

      {tab === "suppliers" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник поставщиков</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Данные загружаются из `GETALLKontragents` и обновляются кроном каждые 15 минут.
          </Typography.Body>
          <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
            <label htmlFor="suppliers-search" className="visually-hidden">Поиск поставщиков по ИНН или наименованию</label>
            <Input
              id="suppliers-search"
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={suppliersSearch}
              onChange={(e) => setSuppliersSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "24rem" }}
              aria-label="Поиск поставщиков по ИНН или наименованию"
            />
            <label htmlFor="suppliers-only-without-email" style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.9rem" }}>
              <input
                id="suppliers-only-without-email"
                type="checkbox"
                checked={suppliersShowOnlyWithoutEmail}
                onChange={(e) => setSuppliersShowOnlyWithoutEmail(e.target.checked)}
              />
              <Typography.Body>Только без email</Typography.Body>
            </label>
            <Button
              type="button"
              className="filter-button"
              disabled={suppliersLoading}
              onClick={() => {
                setSuppliersSyncMessage(null);
                setSuppliersFetchTrigger((n) => n + 1);
              }}
              style={{ marginLeft: "auto" }}
            >
              {suppliersLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить
            </Button>
            {isSuperAdmin && (
              <Button
                type="button"
                className="button-primary"
                disabled={suppliersSyncLoading}
                onClick={async () => {
                  setSuppliersSyncLoading(true);
                  setSuppliersSyncMessage(null);
                  setSuppliersSyncDebugResponse("");
                  setSuppliersSyncDebugRequest("");
                  const endpoint = "/api/admin-refresh-suppliers-cache";
                  const base = typeof window !== "undefined" ? window.location.origin : "";
                  const internalCurl = `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>"`;
                  try {
                    const res = await fetch(endpoint, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${adminToken}` },
                    });
                    const text = await res.text().catch(() => "");
                    const data = (() => {
                      try { return text ? JSON.parse(text) : {}; } catch { return {}; }
                    })();
                    const upstreamCurl = typeof data?.upstream_curl === "string" ? data.upstream_curl : "";
                    const upstreamUrl = typeof data?.upstream_url === "string" ? data.upstream_url : "";
                    setSuppliersSyncDebugRequest(
                      upstreamCurl
                        ? upstreamCurl
                        : (upstreamUrl ? `curl --location '${upstreamUrl}'` : internalCurl)
                    );
                    setSuppliersSyncDebugResponse(`HTTP ${res.status}\n${text ? (typeof data === "object" && Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : text) : "{}"}`);
                    if (!res.ok) throw new Error(data?.error || "Не удалось обновить справочник поставщиков");
                    setSuppliersSyncMessage(`Обновлено: ${Number(data?.suppliers_count || 0)} записей`);
                    setSuppliersFetchTrigger((n) => n + 1);
                  } catch (e: unknown) {
                    setSuppliersSyncMessage((e as Error)?.message || "Не удалось обновить справочник поставщиков");
                    setSuppliersSyncDebugRequest(internalCurl);
                    setSuppliersSyncDebugResponse(`Ошибка: ${(e as Error)?.message || "Неизвестная ошибка"}`);
                  } finally {
                    setSuppliersSyncLoading(false);
                  }
                }}
              >
                {suppliersSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
                Обновить из 1С
              </Button>
            )}
          </Flex>
          {suppliersSyncMessage && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {suppliersSyncMessage}
            </Typography.Body>
          )}
          {(suppliersSyncDebugRequest || suppliersSyncDebugResponse) && (
            <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.65rem", borderRadius: 8, border: "1px dashed var(--color-border)", background: "var(--color-bg-hover)" }}>
              {suppliersSyncDebugRequest ? (
                <Typography.Body style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
                  <strong>Запрос:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{suppliersSyncDebugRequest}</pre>
                </Typography.Body>
              ) : null}
              {suppliersSyncDebugResponse ? (
                <Typography.Body style={{ fontSize: "0.78rem" }}>
                  <strong>Ответ:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{suppliersSyncDebugResponse}</pre>
                </Typography.Body>
              ) : null}
            </div>
          )}
          {suppliersLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : suppliersList.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
              {suppliersSearch.trim().length >= 2 ? "Нет совпадений" : "Справочник пуст"}
            </Typography.Body>
          ) : (() => {
            const filtered = suppliersShowOnlyWithoutEmail
              ? suppliersList.filter((s) => !s.email || String(s.email).trim() === "")
              : suppliersList;
            const sorted = [...filtered].sort((a, b) => {
              const key = suppliersSortBy;
              const va = (key === "inn" ? a.inn : key === "supplier_name" ? (a.supplier_name || "") : (a.email || "")).toLowerCase();
              const vb = (key === "inn" ? b.inn : key === "supplier_name" ? (b.supplier_name || "") : (b.email || "")).toLowerCase();
              const cmp = va.localeCompare(vb, "ru");
              return suppliersSortOrder === "asc" ? cmp : -cmp;
            });
            const toggleSort = (col: "inn" | "supplier_name" | "email") => {
              if (suppliersSortBy === col) setSuppliersSortOrder((o) => (o === "asc" ? "desc" : "asc"));
              else { setSuppliersSortBy(col); setSuppliersSortOrder("asc"); }
            };
            const thStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
            const thClass = "sortable-th";
            return (
              <>
                <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={suppliersSortBy === "inn" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          ИНН {suppliersSortBy === "inn" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("supplier_name")} role="columnheader" aria-sort={suppliersSortBy === "supplier_name" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          Наименование {suppliersSortBy === "supplier_name" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                        <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={suppliersSortBy === "email" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                          Email {suppliersSortBy === "email" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s) => (
                        <tr key={s.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{s.inn}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{s.supplier_name || "—"}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{s.email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
                  Записей: {sorted.length}{suppliersShowOnlyWithoutEmail && sorted.length !== suppliersList.length ? ` (из ${suppliersList.length})` : ""}
                </Typography.Body>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === "tariffs" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Тарифы</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Данные загружаются из GETAPI?metod=GETTarifs и обновляются кроном каждые 6 часов.
          </Typography.Body>
          <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
            <Button
              type="button"
              className="filter-button"
              disabled={tariffsLoading}
              onClick={() => setTariffsFetchTrigger((n) => n + 1)}
            >
              {tariffsLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить
            </Button>
            <Button
              type="button"
              className="button-primary"
              disabled={tariffsSyncLoading}
              onClick={async () => {
                setTariffsSyncLoading(true);
                setTariffsSyncMessage(null);
                setTariffsSyncDebugResponse("");
                setTariffsSyncDebugRequest("");
                const endpoint = "/api/admin-refresh-tariffs-cache";
                const upstreamCurlFallback = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETTarifs' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;
                try {
                  const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${adminToken}` },
                  });
                  const text = await res.text().catch(() => "");
                  const data = (() => {
                    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
                  })();
                  const upstreamCurl = typeof data?.upstream_curl === "string" ? data.upstream_curl : "";
                  const upstreamUrl = typeof data?.upstream_url === "string" ? data.upstream_url : "";
                  setTariffsSyncDebugRequest(
                    upstreamCurl
                      ? upstreamCurl
                      : (upstreamUrl ? `curl --location '${upstreamUrl}'` : upstreamCurlFallback)
                  );
                  setTariffsSyncDebugResponse(`HTTP ${res.status}\n${text ? (typeof data === "object" && Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : text) : "{}"}`);
                  if (!res.ok) throw new Error(data?.error || "Не удалось обновить справочник тарифов");
                  setTariffsSyncMessage(`Обновлено: ${Number(data?.tariffs_count ?? 0)} записей`);
                  setTariffsFetchTrigger((n) => n + 1);
                } catch (e: unknown) {
                  setTariffsSyncMessage((e as Error)?.message || "Не удалось обновить справочник тарифов");
                  setTariffsSyncDebugRequest(upstreamCurlFallback);
                  setTariffsSyncDebugResponse(`Ошибка: ${(e as Error)?.message || "Неизвестная ошибка"}`);
                } finally {
                  setTariffsSyncLoading(false);
                }
              }}
            >
              {tariffsSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить из 1С
            </Button>
          </Flex>
          {tariffsSyncMessage && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {tariffsSyncMessage}
            </Typography.Body>
          )}
          {(tariffsSyncDebugRequest || tariffsSyncDebugResponse) && (
            <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.65rem", borderRadius: 8, border: "1px dashed var(--color-border)", background: "var(--color-bg-hover)" }}>
              {tariffsSyncDebugRequest ? (
                <Typography.Body style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
                  <strong>Запрос:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{tariffsSyncDebugRequest}</pre>
                </Typography.Body>
              ) : null}
              {tariffsSyncDebugResponse ? (
                <Typography.Body style={{ fontSize: "0.78rem" }}>
                  <strong>Ответ:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{tariffsSyncDebugResponse}</pre>
                </Typography.Body>
              ) : null}
            </div>
          )}
          {tariffsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : tariffsList.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Заказчик</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Город отправления</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Город назначения</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Вид перевозки</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>ОГ</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>ВС</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Тариф</th>
                  </tr>
                </thead>
                <tbody>
                  {tariffsList.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.docDate ? new Date(t.docDate).toLocaleDateString("ru-RU") : "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.docNumber || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(t.customerName) || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.customerInn || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{t.cityFrom || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{t.cityTo || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{t.transportType || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{t.isDangerous ? "Да" : "Нет"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{t.isVet ? "Да" : "Нет"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        {t.tariff != null ? Number(t.tariff).toLocaleString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!tariffsLoading && tariffsList.length > 0 && (
            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Записей: {tariffsList.length}
            </Typography.Body>
          )}
        </Panel>
      )}

      {tab === "sverki" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Акты сверок</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Данные загружаются из GETAPI?metod=GETsverki и обновляются кроном раз в 24 часа.
          </Typography.Body>
          <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
            <Button
              type="button"
              className="filter-button"
              disabled={sverkiLoading}
              onClick={() => setSverkiFetchTrigger((n) => n + 1)}
            >
              {sverkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить
            </Button>
            <Button
              type="button"
              className="button-primary"
              disabled={sverkiSyncLoading}
              onClick={async () => {
                setSverkiSyncLoading(true);
                setSverkiSyncMessage(null);
                setSverkiSyncDebugResponse("");
                setSverkiSyncDebugRequest("");
                const endpoint = "/api/admin-refresh-sverki-cache";
                const upstreamCurlFallback = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETsverki' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;
                try {
                  const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${adminToken}` },
                  });
                  const text = await res.text().catch(() => "");
                  const data = (() => {
                    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
                  })();
                  const upstreamCurl = typeof data?.upstream_curl === "string" ? data.upstream_curl : "";
                  const upstreamUrl = typeof data?.upstream_url === "string" ? data.upstream_url : "";
                  setSverkiSyncDebugRequest(
                    upstreamCurl
                      ? upstreamCurl
                      : (upstreamUrl ? `curl --location '${upstreamUrl}'` : upstreamCurlFallback)
                  );
                  setSverkiSyncDebugResponse(`HTTP ${res.status}\n${text ? (typeof data === "object" && Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : text) : "{}"}`);
                  if (!res.ok) throw new Error(data?.error || "Не удалось обновить справочник актов сверок");
                  setSverkiSyncMessage(`Обновлено: ${Number(data?.sverki_count ?? 0)} записей`);
                  setSverkiFetchTrigger((n) => n + 1);
                } catch (e: unknown) {
                  setSverkiSyncMessage((e as Error)?.message || "Не удалось обновить справочник актов сверок");
                  setSverkiSyncDebugRequest(upstreamCurlFallback);
                  setSverkiSyncDebugResponse(`Ошибка: ${(e as Error)?.message || "Неизвестная ошибка"}`);
                } finally {
                  setSverkiSyncLoading(false);
                }
              }}
            >
              {sverkiSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить из 1С
            </Button>
          </Flex>
          {sverkiSyncMessage && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {sverkiSyncMessage}
            </Typography.Body>
          )}
          {sverkiDownloadError && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "#ef4444" }}>
              {sverkiDownloadError}
            </Typography.Body>
          )}
          {(sverkiSyncDebugRequest || sverkiSyncDebugResponse) && (
            <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.65rem", borderRadius: 8, border: "1px dashed var(--color-border)", background: "var(--color-bg-hover)" }}>
              {sverkiSyncDebugRequest ? (
                <Typography.Body style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
                  <strong>Запрос:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{sverkiSyncDebugRequest}</pre>
                </Typography.Body>
              ) : null}
              {sverkiSyncDebugResponse ? (
                <Typography.Body style={{ fontSize: "0.78rem" }}>
                  <strong>Ответ:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{sverkiSyncDebugResponse}</pre>
                </Typography.Body>
              ) : null}
            </div>
          )}
          {sverkiLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : sverkiList.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период с</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период по</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sverkiList.map((row) => {
                    const number = String(row.docNumber || "").trim();
                    const docDateRaw = row.docDate;
                    const hasDownload = number && docDateRaw;
                    const isDownloading = sverkiDownloadingId === row.id;
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docDate ? new Date(row.docDate).toLocaleDateString("ru-RU") : "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.periodFrom ? new Date(row.periodFrom).toLocaleDateString("ru-RU") : "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.periodTo ? new Date(row.periodTo).toLocaleDateString("ru-RU") : "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.customerInn || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                          {hasDownload ? (
                            <Button
                              type="button"
                              className="filter-button"
                              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                              disabled={isDownloading}
                              onClick={() => downloadSverkaFile(row)}
                            >
                              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />}
                              Скачать
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!sverkiLoading && sverkiList.length > 0 && (
            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Записей: {sverkiList.length}
            </Typography.Body>
          )}
        </Panel>
      )}

      {tab === "dogovors" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Договоры</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Данные загружаются из GETAPI?metod=GETdogovors и обновляются кроном раз в 24 часа.
          </Typography.Body>
          <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
            <Button
              type="button"
              className="filter-button"
              disabled={dogovorsLoading}
              onClick={() => setDogovorsFetchTrigger((n) => n + 1)}
            >
              {dogovorsLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить
            </Button>
            <Button
              type="button"
              className="button-primary"
              disabled={dogovorsSyncLoading}
              onClick={async () => {
                setDogovorsSyncLoading(true);
                setDogovorsSyncMessage(null);
                setDogovorsSyncDebugResponse("");
                setDogovorsSyncDebugRequest("");
                const endpoint = "/api/admin-refresh-dogovors-cache";
                const upstreamCurlFallback = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETdogovors' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;
                try {
                  const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${adminToken}` },
                  });
                  const text = await res.text().catch(() => "");
                  const data = (() => {
                    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
                  })();
                  const upstreamCurl = typeof data?.upstream_curl === "string" ? data.upstream_curl : "";
                  const upstreamUrl = typeof data?.upstream_url === "string" ? data.upstream_url : "";
                  setDogovorsSyncDebugRequest(
                    upstreamCurl
                      ? upstreamCurl
                      : (upstreamUrl ? `curl --location '${upstreamUrl}'` : upstreamCurlFallback)
                  );
                  setDogovorsSyncDebugResponse(`HTTP ${res.status}\n${text ? (typeof data === "object" && Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : text) : "{}"}`);
                  if (!res.ok) throw new Error(data?.error || "Не удалось обновить справочник договоров");
                  setDogovorsSyncMessage(`Обновлено: ${Number(data?.dogovors_count ?? 0)} записей`);
                  setDogovorsFetchTrigger((n) => n + 1);
                } catch (e: unknown) {
                  setDogovorsSyncMessage((e as Error)?.message || "Не удалось обновить справочник договоров");
                  setDogovorsSyncDebugRequest(upstreamCurlFallback);
                  setDogovorsSyncDebugResponse(`Ошибка: ${(e as Error)?.message || "Неизвестная ошибка"}`);
                } finally {
                  setDogovorsSyncLoading(false);
                }
              }}
            >
              {dogovorsSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить из 1С
            </Button>
          </Flex>
          {dogovorsSyncMessage && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {dogovorsSyncMessage}
            </Typography.Body>
          )}
          {dogovorsDownloadError && (
            <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "#ef4444" }}>
              {dogovorsDownloadError}
            </Typography.Body>
          )}
          {(dogovorsSyncDebugRequest || dogovorsSyncDebugResponse) && (
            <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.65rem", borderRadius: 8, border: "1px dashed var(--color-border)", background: "var(--color-bg-hover)" }}>
              {dogovorsSyncDebugRequest ? (
                <Typography.Body style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
                  <strong>Запрос:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{dogovorsSyncDebugRequest}</pre>
                </Typography.Body>
              ) : null}
              {dogovorsSyncDebugResponse ? (
                <Typography.Body style={{ fontSize: "0.78rem" }}>
                  <strong>Ответ:</strong>
                  <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{dogovorsSyncDebugResponse}</pre>
                </Typography.Body>
              ) : null}
            </div>
          )}
          {dogovorsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : dogovorsList.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {dogovorsList.map((row) => {
                    const hasDownload = row.docNumber && row.docDate && row.customerInn;
                    const isDownloading = dogovorsDownloadingId === row.id;
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docDate ? new Date(row.docDate).toLocaleDateString("ru-RU") : "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.customerInn || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{row.title || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                          {hasDownload ? (
                            <Button
                              type="button"
                              className="filter-button"
                              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                              disabled={isDownloading}
                              onClick={() => downloadDogovorFile(row)}
                            >
                              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />}
                              Скачать
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!dogovorsLoading && dogovorsList.length > 0 && (
            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Записей: {dogovorsList.length}
            </Typography.Body>
          )}
        </Panel>
      )}

      {tab === "payment_calendar" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Платёжный календарь</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Срок оплаты — в календарных днях с момента выставления счёта. Можно задать платёжные дни недели (например вторник и четверг): при наступлении срока оплата планируется на первый из этих дней. Если платёжные дни не заданы — на первый рабочий день.
          </Typography.Body>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={paymentCalendarSearch}
              onChange={(e) => setPaymentCalendarSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "22rem" }}
              aria-label="Поиск заказчиков"
            />
            <Button type="button" className="filter-button" onClick={() => fetchPaymentCalendarCustomers()} disabled={paymentCalendarCustomerLoading}>
              {paymentCalendarCustomerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
            </Button>
          </Flex>
          {paymentCalendarLoading ? (
            <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка условий...</Typography.Body>
            </Flex>
          ) : null}
          <Flex gap="0.75rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="payment-calendar-days" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>Срок оплаты (календарных дней с момента выставления счёта):</label>
            <input
              id="payment-calendar-days"
              type="number"
              min={0}
              max={365}
              value={paymentCalendarDaysInput}
              onChange={(e) => setPaymentCalendarDaysInput(e.target.value)}
              className="admin-form-input"
              style={{ width: "5rem", padding: "0.35rem 0.5rem" }}
              aria-label="Срок в календарных днях (не день недели)"
            />
            <Flex gap="0.25rem" wrap="wrap" align="center">
              {PAYMENT_DAYS_OPTIONS.filter((d) => d > 0).map((d) => (
                <Button
                  key={d}
                  type="button"
                  className="filter-button"
                  style={{ padding: "0.25rem 0.5rem", minWidth: "2.5rem" }}
                  onClick={() => setPaymentCalendarDaysInput(String(d))}
                >
                  {d}
                </Button>
              ))}
            </Flex>
            <Button
              type="button"
              className="button-primary"
              disabled={paymentCalendarSaving || paymentCalendarSelectedInns.size === 0}
              onClick={async () => {
                const days = Math.max(0, Math.min(365, parseInt(paymentCalendarDaysInput, 10) || 0));
                if (paymentCalendarSelectedInns.size === 0) return;
                setPaymentCalendarSaving(true);
                setError(null);
                try {
                  const res = await fetch("/api/admin-payment-calendar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({ inns: Array.from(paymentCalendarSelectedInns), days_to_pay: days }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                  fetchPaymentCalendar();
                  setPaymentCalendarSelectedInns(new Set());
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка");
                } finally {
                  setPaymentCalendarSaving(false);
                }
              }}
            >
              {paymentCalendarSaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Применить к выбранным ({paymentCalendarSelectedInns.size})
            </Button>
          </Flex>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
            <Button
              type="button"
              className="filter-button"
              onClick={() => {
                const inns = paymentCalendarCustomerList.map((c) => c.inn);
                const allSelected = inns.length > 0 && inns.every((inn) => paymentCalendarSelectedInns.has(inn));
                if (allSelected) {
                  setPaymentCalendarSelectedInns((prev) => {
                    const next = new Set(prev);
                    inns.forEach((inn) => next.delete(inn));
                    return next;
                  });
                } else {
                  setPaymentCalendarSelectedInns((prev) => new Set([...prev, ...inns]));
                }
              }}
              disabled={paymentCalendarCustomerList.length === 0}
            >
              {paymentCalendarCustomerList.length > 0 && paymentCalendarCustomerList.every((c) => paymentCalendarSelectedInns.has(c.inn))
                ? "Снять выделение"
                : "Выделить все"}
            </Button>
          </Flex>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
            <Typography.Body style={{ fontSize: "0.9rem" }}>Платежные дни недели (при наступлении срока — первый из этих дней):</Typography.Body>
            {PAYMENT_WEEKDAY_LABELS.map(({ value, label }) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={paymentCalendarBulkWeekdays.includes(value)}
                  onChange={() => {
                    setPaymentCalendarBulkWeekdays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
            <Button
              type="button"
              className="filter-button"
              disabled={paymentCalendarSaving || paymentCalendarSelectedInns.size === 0 || paymentCalendarBulkWeekdays.length === 0}
              onClick={async () => {
                if (paymentCalendarSelectedInns.size === 0 || paymentCalendarBulkWeekdays.length === 0) return;
                setPaymentCalendarSaving(true);
                setError(null);
                try {
                  const res = await fetch("/api/admin-payment-calendar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({ inns: Array.from(paymentCalendarSelectedInns), payment_weekdays: paymentCalendarBulkWeekdays }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                  setPaymentCalendarItems((prev) => {
                    const next = new Map(prev.map((p) => [p.inn, { ...p }]));
                    for (const inn of paymentCalendarSelectedInns) {
                      const cur = next.get(inn);
                      next.set(inn, {
                        inn,
                        customer_name: cur?.customer_name ?? null,
                        days_to_pay: cur?.days_to_pay ?? 0,
                        payment_weekdays: [...paymentCalendarBulkWeekdays],
                      });
                    }
                    return Array.from(next.values());
                  });
                  fetchPaymentCalendar();
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка");
                } finally {
                  setPaymentCalendarSaving(false);
                }
              }}
            >
              Применить к выбранным
            </Button>
          </Flex>
          <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "inn" ? prev : "inn"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "inn" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по ИНН"
                  >
                    ИНН {paymentCalendarSortColumn === "inn" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "customer_name" ? prev : "customer_name"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "customer_name" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по наименованию"
                  >
                    Наименование {paymentCalendarSortColumn === "customer_name" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "days_to_pay" ? prev : "days_to_pay"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "days_to_pay" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по сроку (календарных дней)"
                  >
                    Срок (дней) {paymentCalendarSortColumn === "days_to_pay" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Платежные дни</th>
                </tr>
              </thead>
              <tbody>
                {paymentCalendarCustomerListSorted.map((c) => {
                  const currentDays = c.days != null ? Number(c.days) : 0;
                  const currentWeekdays = c.payment_weekdays ?? [];
                  const selected = paymentCalendarSelectedInns.has(c.inn);
                  const saving = paymentCalendarSavingInn === c.inn;
                  const options = [...new Set([...PAYMENT_DAYS_OPTIONS, currentDays].filter((d) => d >= 0 && d <= 365))].sort((a, b) => a - b);
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setPaymentCalendarSelectedInns((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.inn)) next.delete(c.inn);
                              else next.add(c.inn);
                              return next;
                            });
                          }}
                          aria-label={`Выбрать ${c.customer_name || c.inn}`}
                        />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                        ) : (
                          <select
                            className="admin-form-input"
                            value={currentDays}
                            style={{ minWidth: "4rem", padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                            aria-label={`Срок оплаты в календарных днях для ${c.customer_name || c.inn}`}
                            onChange={async (e) => {
                              const val = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0));
                              setPaymentCalendarSavingInn(c.inn);
                              setError(null);
                              try {
                                const res = await fetch("/api/admin-payment-calendar", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                  body: JSON.stringify({ inn: c.inn, days_to_pay: val }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                                fetchPaymentCalendar();
                              } catch (err: unknown) {
                                setError((err as Error)?.message || "Ошибка");
                              } finally {
                                setPaymentCalendarSavingInn(null);
                              }
                            }}
                          >
                            {options.map((d) => (
                              <option key={d} value={d}>{d === 0 ? "—" : d}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <Flex gap="0.2rem" wrap="wrap">
                            {PAYMENT_WEEKDAY_LABELS.map(({ value, label }) => (
                              <label key={value} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem" }} title={label}>
                                <input
                                  type="checkbox"
                                  checked={currentWeekdays.includes(value)}
                                  onChange={async () => {
                                    const next = currentWeekdays.includes(value)
                                      ? currentWeekdays.filter((d) => d !== value)
                                      : [...currentWeekdays, value].sort((a, b) => a - b);
                                    setPaymentCalendarSavingInn(c.inn);
                                    setError(null);
                                    try {
                                      const res = await fetch("/api/admin-payment-calendar", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                        body: JSON.stringify({ inn: c.inn, payment_weekdays: next }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                                      fetchPaymentCalendar();
                                    } catch (err: unknown) {
                                      setError((err as Error)?.message || "Ошибка");
                                    } finally {
                                      setPaymentCalendarSavingInn(null);
                                    }
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </Flex>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paymentCalendarCustomerList.length === 0 && !paymentCalendarCustomerLoading && (
            <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Введите поиск и нажмите «Найти» или загрузится список заказчиков из справочника.
            </Typography.Body>
          )}

          {paymentCalendarItems.length > 0 && (
            <>
              <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные условия оплаты</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Выберите строки и нажмите «Применить к выбранным», чтобы изменить срок для нескольких заказчиков.
              </Typography.Body>
              <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", marginTop: "0.5rem" }}>
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => {
                    const inns = paymentCalendarItems.map((c) => c.inn);
                    const allSelected = inns.length > 0 && inns.every((inn) => paymentCalendarSelectedInns.has(inn));
                    if (allSelected) {
                      setPaymentCalendarSelectedInns((prev) => {
                        const next = new Set(prev);
                        inns.forEach((inn) => next.delete(inn));
                        return next;
                      });
                    } else {
                      setPaymentCalendarSelectedInns((prev) => new Set([...prev, ...inns]));
                    }
                  }}
                >
                  {paymentCalendarItems.every((c) => paymentCalendarSelectedInns.has(c.inn)) ? "Снять выделение" : "Выделить все"}
                </Button>
              </Flex>
              <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "inn" ? prev : "inn"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "inn" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по ИНН"
                      >
                        ИНН {paymentCalendarSortColumn === "inn" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "customer_name" ? prev : "customer_name"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "customer_name" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по наименованию"
                      >
                        Наименование {paymentCalendarSortColumn === "customer_name" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "days_to_pay" ? prev : "days_to_pay"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "days_to_pay" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по сроку (календарных дней)"
                      >
                        Срок (дней) {paymentCalendarSortColumn === "days_to_pay" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Платежные дни</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentCalendarItemsSorted.map((c) => {
                      const selected = paymentCalendarSelectedInns.has(c.inn);
                      const weekdays = (c.payment_weekdays ?? []).filter((d) => d >= 1 && d <= 5);
                      const weekdaysLabel = weekdays.length > 0
                        ? weekdays.sort((a, b) => a - b).map((d) => PAYMENT_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                        : "—";
                      return (
                        <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.4rem 0.5rem" }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setPaymentCalendarSelectedInns((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.inn)) next.delete(c.inn);
                                  else next.add(c.inn);
                                  return next;
                                });
                              }}
                              aria-label={`Выбрать ${c.customer_name || c.inn}`}
                            />
                          </td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                          <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{c.days_to_pay}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>{weekdaysLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {tab === "work_schedule" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>График работы</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Рабочие дни и часы заказчика для расчёта SLA. По умолчанию Пн–Пт 09:00–18:00.
          </Typography.Body>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={workScheduleSearch}
              onChange={(e) => setWorkScheduleSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "22rem" }}
              aria-label="Поиск заказчиков"
            />
            <Button type="button" className="filter-button" onClick={() => fetchWorkScheduleCustomers()} disabled={workScheduleCustomerLoading}>
              {workScheduleCustomerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
            </Button>
          </Flex>
          {workScheduleLoading ? (
            <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка графиков...</Typography.Body>
            </Flex>
          ) : null}
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
            <Button
              type="button"
              className="filter-button"
              onClick={() => {
                const inns = workScheduleCustomerList.map((c) => c.inn);
                const allSelected = inns.length > 0 && inns.every((inn) => workScheduleSelectedInns.has(inn));
                if (allSelected) {
                  setWorkScheduleSelectedInns((prev) => {
                    const next = new Set(prev);
                    inns.forEach((inn) => next.delete(inn));
                    return next;
                  });
                } else {
                  setWorkScheduleSelectedInns((prev) => new Set([...prev, ...inns]));
                }
              }}
              disabled={workScheduleCustomerList.length === 0}
            >
              {workScheduleCustomerList.length > 0 && workScheduleCustomerList.every((c) => workScheduleSelectedInns.has(c.inn))
                ? "Снять выделение"
                : "Выделить все"}
            </Button>
          </Flex>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Typography.Body style={{ fontSize: "0.9rem" }}>Рабочие дни:</Typography.Body>
            {WORK_SCHEDULE_WEEKDAY_LABELS.map(({ value, label }) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={workScheduleBulkWeekdays.includes(value)}
                  onChange={() => {
                    setWorkScheduleBulkWeekdays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
            <label htmlFor="work-schedule-bulk-start" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>С:</label>
            <input
              id="work-schedule-bulk-start"
              type="time"
              value={workScheduleBulkStart}
              onChange={(e) => setWorkScheduleBulkStart(e.target.value)}
              className="admin-form-input"
              style={{ padding: "0.35rem 0.5rem" }}
            />
            <label htmlFor="work-schedule-bulk-end" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>До:</label>
            <input
              id="work-schedule-bulk-end"
              type="time"
              value={workScheduleBulkEnd}
              onChange={(e) => setWorkScheduleBulkEnd(e.target.value)}
              className="admin-form-input"
              style={{ padding: "0.35rem 0.5rem" }}
            />
            <Button
              type="button"
              className="button-primary"
              disabled={workScheduleSaving || workScheduleSelectedInns.size === 0}
              onClick={async () => {
                if (workScheduleSelectedInns.size === 0) return;
                setWorkScheduleSaving(true);
                setError(null);
                try {
                  const body: { inns: string[]; days_of_week?: number[]; work_start?: string; work_end?: string } = {
                    inns: Array.from(workScheduleSelectedInns),
                  };
                  if (workScheduleBulkWeekdays.length > 0) body.days_of_week = workScheduleBulkWeekdays;
                  if (workScheduleBulkStart) body.work_start = workScheduleBulkStart;
                  if (workScheduleBulkEnd) body.work_end = workScheduleBulkEnd;
                  if (!body.days_of_week && !body.work_start && !body.work_end) {
                    setError("Выберите дни недели и/или укажите часы работы");
                    return;
                  }
                  const res = await fetch("/api/admin-work-schedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify(body),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                  fetchWorkSchedule();
                  setWorkScheduleSelectedInns(new Set());
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка");
                } finally {
                  setWorkScheduleSaving(false);
                }
              }}
            >
              {workScheduleSaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Применить к выбранным ({workScheduleSelectedInns.size})
            </Button>
          </Flex>
          <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>С</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>До</th>
                </tr>
              </thead>
              <tbody>
                {workScheduleCustomerListSorted.map((c) => {
                  const currentWeekdays = c.days_of_week ?? [1, 2, 3, 4, 5];
                  const currentStart = c.work_start ?? "09:00";
                  const currentEnd = c.work_end ?? "18:00";
                  const selected = workScheduleSelectedInns.has(c.inn);
                  const saving = workScheduleSavingInn === c.inn;
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setWorkScheduleSelectedInns((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.inn)) next.delete(c.inn);
                              else next.add(c.inn);
                              return next;
                            });
                          }}
                          aria-label={`Выбрать ${c.customer_name || c.inn}`}
                        />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                        ) : (
                          <Flex gap="0.2rem" wrap="wrap">
                            {WORK_SCHEDULE_WEEKDAY_LABELS.map(({ value, label }) => (
                              <label key={value} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem" }} title={label}>
                                <input
                                  type="checkbox"
                                  checked={currentWeekdays.includes(value)}
                                  onChange={async () => {
                                    const next = currentWeekdays.includes(value)
                                      ? currentWeekdays.filter((d) => d !== value)
                                      : [...currentWeekdays, value].sort((a, b) => a - b);
                                    setWorkScheduleSavingInn(c.inn);
                                    setError(null);
                                    try {
                                      const res = await fetch("/api/admin-work-schedule", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                        body: JSON.stringify({ inn: c.inn, days_of_week: next }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                                      fetchWorkSchedule();
                                    } catch (err: unknown) {
                                      setError((err as Error)?.message || "Ошибка");
                                    } finally {
                                      setWorkScheduleSavingInn(null);
                                    }
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </Flex>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <input
                            type="time"
                            value={currentStart}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setWorkScheduleSavingInn(c.inn);
                              setError(null);
                              try {
                                const res = await fetch("/api/admin-work-schedule", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                  body: JSON.stringify({ inn: c.inn, work_start: val }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                                fetchWorkSchedule();
                              } catch (err: unknown) {
                                setError((err as Error)?.message || "Ошибка");
                              } finally {
                                setWorkScheduleSavingInn(null);
                              }
                            }}
                            className="admin-form-input"
                            style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                          />
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <input
                            type="time"
                            value={currentEnd}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setWorkScheduleSavingInn(c.inn);
                              setError(null);
                              try {
                                const res = await fetch("/api/admin-work-schedule", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                  body: JSON.stringify({ inn: c.inn, work_end: val }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
                                fetchWorkSchedule();
                              } catch (err: unknown) {
                                setError((err as Error)?.message || "Ошибка");
                              } finally {
                                setWorkScheduleSavingInn(null);
                              }
                            }}
                            className="admin-form-input"
                            style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {workScheduleCustomerList.length === 0 && !workScheduleCustomerLoading && (
            <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Введите поиск и нажмите «Найти» или загрузится список заказчиков из справочника.
            </Typography.Body>
          )}
          {workScheduleItems.length > 0 && (
            <>
              <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные графики работы</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Список заказчиков с настроенным графиком.
              </Typography.Body>
              <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Часы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workScheduleItems.map((c) => {
                      const weekdays = (c.days_of_week ?? []).filter((d) => d >= 1 && d <= 7);
                      const weekdaysLabel = weekdays.length > 0
                        ? weekdays.sort((a, b) => a - b).map((d) => WORK_SCHEDULE_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                        : "—";
                      return (
                        <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{weekdaysLabel}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.work_start || "09:00"}–{c.work_end || "18:00"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {tab === "timesheet" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Табель учета рабочего времени</Typography.Body>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.8rem" }}>
            <Flex
              align="center"
              gap="0.4rem"
              style={{
                minWidth: "12rem",
                height: "2.5rem",
                boxSizing: "border-box",
                padding: "0 0.45rem",
                border: `1px solid ${timesheetMonthPaymentStatus.border}`,
                borderRadius: 8,
                background: timesheetMonthPaymentStatus.bg,
              }}
            >
              <select
                className="admin-form-input"
                value={timesheetMonthParts.month}
                onChange={(e) => setTimesheetMonth(`${timesheetMonthParts.year}-${e.target.value}`)}
                style={{
                  height: "2rem",
                  border: "none",
                  background: "transparent",
                  color: timesheetMonthPaymentStatus.color,
                  fontWeight: 600,
                  minWidth: "6.6rem",
                  padding: 0,
                }}
                aria-label="Месяц табеля"
              >
                {TIMESHEET_MONTH_OPTIONS.map((opt) => (
                  <option key={`timesheet-month-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                className="admin-form-input"
                value={timesheetMonthParts.year}
                onChange={(e) => setTimesheetMonth(`${e.target.value}-${timesheetMonthParts.month}`)}
                style={{
                  height: "2rem",
                  border: "none",
                  background: "transparent",
                  color: timesheetMonthPaymentStatus.color,
                  fontWeight: 600,
                  minWidth: "4.1rem",
                  padding: 0,
                }}
                aria-label="Год табеля"
              >
                {timesheetYearOptions.map((year) => (
                  <option key={`timesheet-year-${year}`} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </Flex>
            <Input
              type="text"
              className="admin-form-input"
              value={timesheetSearch}
              onChange={(e) => setTimesheetSearch(e.target.value)}
              placeholder="Поиск по ФИО, email, подразделению"
              style={{ minWidth: "18rem", flex: 1, height: "2.5rem", boxSizing: "border-box" }}
            />
          </Flex>
          <Typography.Body style={{ fontSize: "0.78rem", color: timesheetMonthPaymentStatus.color, marginTop: "-0.35rem", marginBottom: "0.55rem" }}>
            Статус месяца: {timesheetMonthPaymentStatus.label}
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "-0.35rem", marginBottom: "0.7rem" }}>
            Нажмите на сотрудника, чтобы открыть таблицу выплат и отметить дни к оплате.
          </Typography.Body>
          {employeeDirectoryLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : (
            <>
              {timesheetDays.length === 0 ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                  Выберите месяц для отображения табеля.
                </Typography.Body>
              ) : timesheetEmployeesByDepartment.length === 0 ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                  За выбранный период сотрудники не найдены.
                </Typography.Body>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                  {timesheetEmployeesByDepartment.map((group) => (
                    <Panel key={`timesheet-group-${group.department}`} className="cargo-card" style={{ padding: "0.6rem" }}>
                      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                        Подразделение: {group.department}
                      </Typography.Body>
                      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh", WebkitOverflowScrolling: "touch" }}>
                        <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, left: 0, background: "var(--color-bg-card, #fff)", zIndex: 40, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                                Сотрудник
                              </th>
                              {timesheetDays.map((d) => (
                                <th
                                  key={`timesheet-head-${group.department}-${d.iso}`}
                                  style={{
                                    position: "sticky",
                                    top: 0,
                                    zIndex: 20,
                                    textAlign: "center",
                                    padding: "0.35rem 0.25rem",
                                    borderBottom: "1px solid var(--color-border)",
                                    minWidth: "3.2rem",
                                    background: d.isWeekend ? "var(--color-bg-hover)" : "var(--color-bg-card)",
                                  }}
                                >
                                  <div style={{ fontSize: "0.76rem", color: d.isWeekend ? "#d93025" : "inherit", fontWeight: d.isWeekend ? 600 : 500 }}>{d.day}</div>
                                  <div style={{ fontSize: "0.68rem", color: d.isWeekend ? "#d93025" : "var(--color-text-secondary)" }}>{d.weekdayShort}</div>
                                </th>
                              ))}
                              <th style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", minWidth: "4rem", background: "var(--color-bg-card)" }}>Итого</th>
                              {SHIFT_MARK_CODES.map((code) => (
                                <th key={`timesheet-legend-head-${code}`} style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)", minWidth: "52px", background: "var(--color-bg-card)" }}>
                                  {code}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.employees.map((emp) => {
                              const accrualType = normalizeAccrualType(emp.accrual_type);
                              const isShiftAccrual = accrualType === "shift";
                              const isMarkAccrual = isMarkAccrualType(accrualType);
                              const hourlyRate = Number(emp.accrual_rate ?? 0);
                              const shiftHours = 8;
                              const totalShifts = timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                const val = timesheetHours[key] || "";
                                return acc + (normalizeShiftMark(val) === "Я" ? 1 : 0);
                              }, 0);
                              const totalHours = isMarkAccrual
                                ? totalShifts * shiftHours
                                : timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                                  }, 0);
                              const totalMoney = isMarkAccrual
                                ? (isShiftAccrual
                                    ? timesheetDays.reduce((acc, d) => {
                                        const key = `${emp.id}__${d.iso}`;
                                        if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                        const override = Number(timesheetShiftRateOverrides[key]);
                                        const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                        return acc + dayRate;
                                      }, 0)
                                    : totalShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                                : totalHours * hourlyRate;
                              const paidShifts = isMarkAccrual
                                ? timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    if (!timesheetPaymentMarks[key]) return acc;
                                    return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
                                  }, 0)
                                : 0;
                              const paidHours = isMarkAccrual
                                ? paidShifts * shiftHours
                                : timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    if (!timesheetPaymentMarks[key]) return acc;
                                    return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                                  }, 0);
                              const totalMoneyToPay = isMarkAccrual
                                ? (isShiftAccrual
                                    ? timesheetDays.reduce((acc, d) => {
                                        const key = `${emp.id}__${d.iso}`;
                                        if (!timesheetPaymentMarks[key]) return acc;
                                        if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                        const override = Number(timesheetShiftRateOverrides[key]);
                                        const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                        return acc + dayRate;
                                      }, 0)
                                    : paidShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                                : paidHours * hourlyRate;
                              const totalPrimaryText = isMarkAccrual
                                ? `${totalShifts} ${timesheetMobilePicker ? "смены" : "смен"}`
                                : `${Number(totalHours.toFixed(1))} ${timesheetMobilePicker ? "часы" : "ч"}`;
                              const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                                acc[code] = 0;
                                return acc;
                              }, {});
                              for (const d of timesheetDays) {
                                const key = `${emp.id}__${d.iso}`;
                                const mark = normalizeShiftMark(timesheetHours[key] || "");
                                if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                              }
                              const totalColumnCount = 1 + timesheetDays.length + 1 + SHIFT_MARK_CODES.length;
                              const employeePayouts = timesheetPayoutsByEmployee[String(emp.id)] || [];
                              const employeePaidTotal = employeePayouts.reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
                              const employeeOutstanding = Math.max(0, Number((totalMoney - employeePaidTotal).toFixed(2)));
                              const paidDatesSet = new Set(
                                employeePayouts.flatMap((payout) =>
                                  Array.isArray(payout.paidDates) ? payout.paidDates : []
                                ),
                              );
                              const showTaxColumns = emp.cooperation_type === "ip" || emp.cooperation_type === "self_employed";
                              const markedDaysCount = timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                return acc + (timesheetPaymentMarks[key] ? 1 : 0);
                              }, 0);
                              const isPayoutExpanded = timesheetExpandedEmployeeId === emp.id;
                              return (
                                <React.Fragment key={`timesheet-row-wrap-${group.department}-${emp.id}`}>
                                <tr>
                                  <td style={{ padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", left: 0, background: "var(--color-bg-card, #fff)", zIndex: 30, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                                    <Typography.Body
                                      style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
                                      onClick={() => {
                                        setTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
                                      }}
                                    >
                                      {emp.full_name || emp.login}
                                    </Typography.Body>
                                    <Typography.Body style={{ display: "block", fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.1rem" }}>{emp.position || "—"}</Typography.Body>
                                  </td>
                                  {timesheetDays.map((d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    const value = (timesheetHours[key] || "").trim().toUpperCase();
                                    const fallback = "0";
                                    const shiftMark = normalizeShiftMark(value);
                                    const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                                    const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                                    const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                                    const hourInputValue = parseTimesheetHoursValue(value) > 0 ? String(parseTimesheetHoursValue(value)) : "";
                                    const hourPickerValue = toHalfHourValue(hourInputValue || fallback);
                                    const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === "Я";
                                    const isMarkedForPayment = timesheetPaymentMarks[key] === true;
                                    const isPaidDate = paidDatesSet.has(d.iso);
                                    const baseShiftRate = Number(emp.accrual_rate || 0);
                                    const overrideShiftRate = Number(timesheetShiftRateOverrides[key]);
                                    const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                                    const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                                    const shiftRateHint = hasOverrideShiftRate
                                      ? `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽ · Ручная: ${overrideShiftRate.toLocaleString("ru-RU")} ₽`
                                      : `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽`;
                                    return (
                                      <td
                                        key={`timesheet-cell-${emp.id}-${d.iso}`}
                                        onClick={() => {
                                          if (!isPayoutExpanded) return;
                                          if (isPaidDate) return;
                                          const nextPaid = !isMarkedForPayment;
                                          setTimesheetPaymentMarks((prev) => ({ ...prev, [key]: nextPaid }));
                                          void saveTimesheetPaymentMark(emp.id, d.iso, nextPaid);
                                        }}
                                        style={{
                                          padding: isPaidDate ? "0.2rem 0.2rem 0.72rem 0.2rem" : "0.2rem",
                                          borderBottom: "1px solid var(--color-border)",
                                          background: isMarkedForPayment ? "#fff7d6" : (d.isWeekend ? "var(--color-bg-hover)" : "transparent"),
                                          boxShadow: isMarkedForPayment ? "inset 0 0 0 1px #f59e0b" : (isPaidDate ? "inset 0 0 0 1px #16a34a" : undefined),
                                          cursor: isPayoutExpanded ? (isPaidDate ? "not-allowed" : "pointer") : "default",
                                          opacity: isPayoutExpanded && isPaidDate ? 0.9 : 1,
                                        }}
                                        title={isPaidDate ? "Этот день уже оплачен, повторная оплата запрещена" : undefined}
                                      >
                                        {isMarkAccrual ? (
                                          <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTriggeredRef.current) {
                                                  adminShiftHoldTriggeredRef.current = false;
                                                  return;
                                                }
                                                const nextValue = shiftMark === "Я" ? "" : "Я";
                                                setTimesheetHours((prev) => ({
                                                  ...prev,
                                                  [key]: nextValue,
                                                }));
                                                if (isShiftAccrual && nextValue !== "Я") {
                                                  setTimesheetShiftRateOverrides((prev) => {
                                                    const next = { ...prev };
                                                    delete next[key];
                                                    return next;
                                                  });
                                                  void saveTimesheetShiftRate(emp.id, d.iso, "");
                                                }
                                                void saveTimesheetCell(emp.id, d.iso, nextValue);
                                              }}
                                              onMouseDown={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const { clientX, clientY } = e;
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: isShiftAccrual });
                                                }, 450);
                                              }}
                                              onMouseUp={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onTouchStart={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const touch = e.touches[0];
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: isShiftAccrual });
                                                }, 450);
                                              }}
                                              onTouchEnd={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              style={{
                                                width: "2.2rem",
                                                height: "1.6rem",
                                                padding: 0,
                                                textAlign: "center",
                                                margin: "0 auto",
                                                display: "block",
                                                borderRadius: 999,
                                                border: shiftMarkStyle.border,
                                                background: shiftMarkStyle.background,
                                                color: shiftMarkStyle.color,
                                                fontWeight: 600,
                                                lineHeight: "1.6rem",
                                                fontSize: shiftMark ? "0.82rem" : "1rem",
                                                WebkitAppearance: "none",
                                                appearance: "none",
                                                position: "relative",
                                                overflow: "visible",
                                                cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                                opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                              }}
                                              aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                              title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                            >
                                              {shiftMark || "○"}
                                              {isPaidDate ? (
                                                <span
                                                  style={{
                                                    position: "absolute",
                                                    left: "50%",
                                                    bottom: "-0.68rem",
                                                    transform: "translateX(-50%)",
                                                    fontSize: "0.58rem",
                                                    fontWeight: 700,
                                                    lineHeight: 1,
                                                    padding: "0.07rem 0.22rem",
                                                    borderRadius: 999,
                                                    border: "1px solid #15803d",
                                                    color: "#15803d",
                                                    background: "#dcfce7",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  опл
                                                </span>
                                              ) : null}
                                            </button>
                                            {isShiftAccrual && shiftMark === "Я" ? (
                                              <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={
                                                  Number.isFinite(timesheetShiftRateOverrides[key])
                                                    ? String(timesheetShiftRateOverrides[key])
                                                    : ""
                                                }
                                                placeholder={String(Number(emp.accrual_rate || 0))}
                                                disabled={isPayoutExpanded || isPaidDate}
                                                onChange={(e) => {
                                                  if (isPayoutExpanded || isPaidDate) return;
                                                  const nextRaw = e.target.value;
                                                  if (nextRaw.trim() === "") {
                                                    setTimesheetShiftRateOverrides((prev) => {
                                                      const next = { ...prev };
                                                      delete next[key];
                                                      return next;
                                                    });
                                                    void saveTimesheetShiftRate(emp.id, d.iso, "");
                                                    return;
                                                  }
                                                  const parsed = Number(String(nextRaw).replace(",", "."));
                                                  if (!Number.isFinite(parsed) || parsed < 0) return;
                                                  setTimesheetShiftRateOverrides((prev) => ({
                                                    ...prev,
                                                    [key]: Number(parsed.toFixed(2)),
                                                  }));
                                                  void saveTimesheetShiftRate(emp.id, d.iso, String(parsed));
                                                }}
                                                style={{
                                                  width: "3.4rem",
                                                  minWidth: "3.4rem",
                                                  boxSizing: "border-box",
                                                  border: "1px solid var(--color-border)",
                                                  borderRadius: 6,
                                                  background: "var(--color-bg)",
                                                  padding: "0.08rem 0.2rem",
                                                  textAlign: "center",
                                                  fontSize: "0.68rem",
                                                  lineHeight: 1.1,
                                                }}
                                                aria-label="Ручная стоимость смены"
                                                title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString("ru-RU")} ₽`}
                                              />
                                            ) : null}
                                          </div>
                                        ) : (
                                          <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTriggeredRef.current) {
                                                  adminShiftHoldTriggeredRef.current = false;
                                                  return;
                                                }
                                                const nextMark = hourlyMark === "Я" ? "В" : "Я";
                                                const nextValue = nextMark === "Я" ? (hourInputValue || "Я") : "В";
                                                setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                void saveTimesheetCell(emp.id, d.iso, nextValue);
                                              }}
                                              onMouseDown={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const { clientX, clientY } = e;
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: false });
                                                }, 450);
                                              }}
                                              onMouseUp={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onTouchStart={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const touch = e.touches[0];
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: false });
                                                }, 450);
                                              }}
                                              onTouchEnd={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              style={{
                                                width: "2.2rem",
                                                height: "1.6rem",
                                                padding: 0,
                                                textAlign: "center",
                                                margin: "0 auto",
                                                display: "block",
                                                borderRadius: 999,
                                                border: hourlyMarkStyle.border,
                                                background: hourlyMarkStyle.background,
                                                color: hourlyMarkStyle.color,
                                                fontWeight: 600,
                                                lineHeight: "1.6rem",
                                                fontSize: hourlyMark ? "0.82rem" : "1rem",
                                                WebkitAppearance: "none",
                                                appearance: "none",
                                                position: "relative",
                                                overflow: "visible",
                                                cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                                opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                              }}
                                              aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                            >
                                              {hourlyMark || "В"}
                                              {isPaidDate ? (
                                                <span
                                                  style={{
                                                    position: "absolute",
                                                    left: "50%",
                                                    bottom: "-0.68rem",
                                                    transform: "translateX(-50%)",
                                                    fontSize: "0.58rem",
                                                    fontWeight: 700,
                                                    lineHeight: 1,
                                                    padding: "0.07rem 0.22rem",
                                                    borderRadius: 999,
                                                    border: "1px solid #15803d",
                                                    color: "#15803d",
                                                    background: "#dcfce7",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  опл
                                                </span>
                                              ) : null}
                                            </button>
                                            {timesheetMobilePicker ? (
                                              <select
                                                value={hourPickerValue}
                                                disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                                onChange={(e) => {
                                                  if (isPaidDate || !hourlyHoursEnabled) return;
                                                  const nextValue = e.target.value;
                                                  setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                  void saveTimesheetCell(emp.id, d.iso, nextValue);
                                                }}
                                                className="admin-form-input"
                                                style={{ width: "4.3rem", padding: "0 0.2rem", textAlign: "center", margin: "0 auto", display: "block" }}
                                                aria-label="Количество часов за день"
                                              >
                                                {timesheetHalfHourOptions.map((opt) => (
                                                  <option key={`${key}-opt-${opt.value}`} value={opt.value}>
                                                    {opt.label}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <input
                                                type="number"
                                                min={0}
                                                max={24}
                                                step={0.5}
                                                value={hourInputValue}
                                                disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                                onChange={(e) => {
                                                  if (isPaidDate || !hourlyHoursEnabled) return;
                                                  const raw = e.target.value;
                                                  const nextValue = raw.trim() === "" ? "Я" : String(Math.max(0, Math.min(24, Number(raw) || 0)));
                                                  setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                  void saveTimesheetCell(emp.id, d.iso, nextValue);
                                                }}
                                                className="admin-form-input"
                                                style={{ width: "3rem", padding: "0 0.25rem", textAlign: "center", margin: "0 auto" }}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td style={{ textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", fontWeight: 600, minWidth: "7.2rem" }}>
                                    <div>{totalPrimaryText}</div>
                                    <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                                      {Number(totalMoney.toFixed(2))} ₽
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: "#15803d", marginTop: "0.12rem" }}>
                                      Остаток: {employeeOutstanding.toLocaleString("ru-RU")} ₽
                                    </div>
                                  </td>
                                  {SHIFT_MARK_CODES.map((code) => (
                                    <td key={`${emp.id}-legend-${code}`} style={{ textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)" }}>
                                      <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                        {legendCounts[code] || 0}
                                      </Typography.Body>
                                    </td>
                                  ))}
                                </tr>
                                {timesheetExpandedEmployeeId === emp.id ? (
                                  <tr>
                                    <td colSpan={totalColumnCount} style={{ padding: "0.55rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                                      <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.45rem" }}>
                                        <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                          Выплаты сотрудника
                                        </Typography.Body>
                                        <Flex align="center" gap="0.45rem" wrap="wrap">
                                          <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                                            Дней к выплате: {markedDaysCount} · Сумма: {Number(totalMoneyToPay.toFixed(2)).toLocaleString("ru-RU")} ₽
                                          </Typography.Body>
                                          <Button
                                            type="button"
                                            className="filter-button"
                                            disabled={timesheetPayoutSavingEmployeeId === emp.id || markedDaysCount === 0 || Number(totalMoneyToPay) <= 0}
                                            onClick={() => void createTimesheetPayout(emp.id)}
                                            style={{ padding: "0.35rem 0.6rem" }}
                                          >
                                            {timesheetPayoutSavingEmployeeId === emp.id ? "Выплата..." : "+ Новая выплата"}
                                          </Button>
                                        </Flex>
                                      </Flex>
                                      {employeePayouts.length === 0 ? (
                                        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                                          Выплат пока нет.
                                        </Typography.Body>
                                      ) : (
                                        <div style={{ overflowX: "auto" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                                                <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                                {showTaxColumns ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                                                ) : null}
                                                {showTaxColumns ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                                                ) : null}
                                                {isSuperAdmin ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                                                ) : null}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {employeePayouts.map((payout) => {
                                                const isEditing = timesheetPayoutEditingId === payout.id && timesheetPayoutEditingEmployeeId === emp.id;
                                                const isActionLoading = timesheetPayoutActionLoadingId === payout.id;
                                                const editAmountNumber = Number(String(timesheetPayoutEditAmount || "").replace(",", "."));
                                                const previewTax = Number.isFinite(editAmountNumber) && editAmountNumber >= 0
                                                  ? ((payout.cooperationType === "ip" || payout.cooperationType === "self_employed")
                                                      ? Number((editAmountNumber / 0.94 - editAmountNumber).toFixed(2))
                                                      : 0)
                                                  : Number(payout.taxAmount || 0);
                                                return (
                                                  <tr key={`timesheet-payout-row-${payout.id}`}>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                      {isEditing ? (
                                                        <input
                                                          type="date"
                                                          className="admin-form-input"
                                                          value={timesheetPayoutEditDate}
                                                          onChange={(e) => setTimesheetPayoutEditDate(e.target.value)}
                                                          style={{ minWidth: "8.6rem", padding: "0.2rem 0.3rem" }}
                                                        />
                                                      ) : (
                                                        payout.payoutDate
                                                      )}
                                                    </td>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                      {payout.periodFrom} — {payout.periodTo}
                                                    </td>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                                                      {isEditing ? (
                                                        <input
                                                          type="number"
                                                          min={0}
                                                          step={0.01}
                                                          className="admin-form-input"
                                                          value={timesheetPayoutEditAmount}
                                                          onChange={(e) => setTimesheetPayoutEditAmount(e.target.value)}
                                                          style={{ width: "7.2rem", textAlign: "right", padding: "0.2rem 0.3rem" }}
                                                        />
                                                      ) : (
                                                        `${Number(payout.amount || 0).toLocaleString("ru-RU")} ₽`
                                                      )}
                                                    </td>
                                                    {showTaxColumns ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600, color: "#b45309" }}>
                                                        {isEditing
                                                          ? `${Number(previewTax || 0).toLocaleString("ru-RU")} ₽`
                                                          : `${Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽`}
                                                      </td>
                                                    ) : null}
                                                    {showTaxColumns ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                                                        {isEditing
                                                          ? `${Number((Number.isFinite(editAmountNumber) ? editAmountNumber + Number(previewTax || 0) : Number(payout.amount || 0) + Number(payout.taxAmount || 0))).toLocaleString("ru-RU")} ₽`
                                                          : `${Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽`}
                                                      </td>
                                                    ) : null}
                                                    {isSuperAdmin ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right" }}>
                                                        {isEditing ? (
                                                          <Flex align="center" justify="flex-end" gap="0.3rem">
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={isActionLoading}
                                                              onClick={() => void updateTimesheetPayout(emp.id, payout.id, timesheetPayoutEditDate, timesheetPayoutEditAmount)}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              {isActionLoading ? "Сохранение..." : "Сохранить"}
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={isActionLoading}
                                                              onClick={() => {
                                                                setTimesheetPayoutEditingId(null);
                                                                setTimesheetPayoutEditingEmployeeId(null);
                                                                setTimesheetPayoutEditDate("");
                                                                setTimesheetPayoutEditAmount("");
                                                              }}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              Отмена
                                                            </Button>
                                                          </Flex>
                                                        ) : (
                                                          <Flex align="center" justify="flex-end" gap="0.3rem">
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={timesheetPayoutActionLoadingId !== null}
                                                              onClick={() => {
                                                                setTimesheetPayoutEditingId(payout.id);
                                                                setTimesheetPayoutEditingEmployeeId(emp.id);
                                                                setTimesheetPayoutEditDate(payout.payoutDate || "");
                                                                setTimesheetPayoutEditAmount(String(Number(payout.amount || 0)));
                                                              }}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              Изменить
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={timesheetPayoutActionLoadingId !== null}
                                                              onClick={() => void deleteTimesheetPayout(emp.id, payout.id)}
                                                              style={{ padding: "0.2rem 0.45rem", borderColor: "#dc2626", color: "#b91c1c" }}
                                                            >
                                                              Удалить
                                                            </Button>
                                                          </Flex>
                                                        )}
                                                      </td>
                                                    ) : null}
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ))}
                  <Flex align="center" gap="0.5rem" wrap="wrap">
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Я - Явка</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ПР - прогул</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Б - Болезнь</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>В - Выходной</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОГ - Отгул</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОТ - отпуск</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>УВ - Уволен</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                      Смена: нажмите и удерживайте для выбора статуса
                    </Typography.Body>
                  </Flex>
                  {timesheetDepartmentSummaries.map((row) => (
                    <Panel key={`timesheet-summary-${row.department}`} className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
                      <Typography.Body style={{ fontWeight: 600 }}>
                        Итого по подразделению: {row.department} · {row.totalShifts} смен · {row.totalHours} ч
                      </Typography.Body>
                      <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                          {row.totalMoney.toLocaleString("ru-RU")} ₽
                        </span>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                          {row.totalPaid.toLocaleString("ru-RU")} ₽
                        </span>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                          {row.totalOutstanding.toLocaleString("ru-RU")} ₽
                        </span>
                      </Flex>
                    </Panel>
                  ))}
                  <Panel className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
                    <Typography.Body style={{ fontWeight: 600 }}>
                      Итого по компании: {timesheetCompanySummary.totalShifts} смен · {timesheetCompanySummary.totalHours} ч
                    </Typography.Body>
                    <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                        {timesheetCompanySummary.totalMoney.toLocaleString("ru-RU")} ₽
                      </span>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                        {timesheetCompanySummary.totalPaid.toLocaleString("ru-RU")} ₽
                      </span>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                        {timesheetCompanySummary.totalOutstanding.toLocaleString("ru-RU")} ₽
                      </span>
                    </Flex>
                  </Panel>
                </div>
              )}
            </>
          )}
          {adminShiftPicker ? (
            <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setAdminShiftPicker(null)}>
              <div
                style={{
                  position: "fixed",
                  top: typeof window !== "undefined" ? Math.min(adminShiftPicker.y + 8, window.innerHeight - 220) : adminShiftPicker.y + 8,
                  left: typeof window !== "undefined" ? Math.min(adminShiftPicker.x - 80, window.innerWidth - 190) : adminShiftPicker.x - 80,
                  width: 180,
                  background: "var(--color-bg-card, #fff)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "0.4rem",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.15)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {SHIFT_MARK_OPTIONS.map((opt) => (
                  <button
                    key={`admin-shift-mark-${opt.code}`}
                    type="button"
                    onClick={() => {
                      if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
                      const currentValue = timesheetHours[adminShiftPicker.key] || "";
                      const currentHours = parseTimesheetHoursValue(currentValue);
                      const nextValue = opt.code === "Я" && !adminShiftPicker.isShift
                        ? (currentHours > 0 ? String(currentHours) : "Я")
                        : opt.code;
                      setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: nextValue }));
                      if (adminShiftPicker.isShift && nextValue !== "Я") {
                        setTimesheetShiftRateOverrides((prev) => {
                          const next = { ...prev };
                          delete next[adminShiftPicker.key];
                          return next;
                        });
                        void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                      }
                      void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, nextValue);
                      setAdminShiftPicker(null);
                    }}
                    style={{
                      width: "100%",
                      marginBottom: "0.25rem",
                      padding: "0.35rem 0.5rem",
                      borderRadius: 8,
                      border: `1px solid ${opt.border}`,
                      background: opt.bg,
                      color: opt.color,
                      textAlign: "left",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.code} - {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
                    setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: "" }));
                    if (adminShiftPicker.isShift) {
                      setTimesheetShiftRateOverrides((prev) => {
                        const next = { ...prev };
                        delete next[adminShiftPicker.key];
                        return next;
                      });
                      void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                    }
                    void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                    setAdminShiftPicker(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.3rem 0.5rem",
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg)",
                    color: "var(--color-text-secondary)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  ○ - очистить
                </button>
              </div>
            </div>
          ) : null}
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
              <option value="user_archived">Профиль в архиве</option>
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
                    : a === "email_settings_saved" ? "Настройки почты" : a === "preset_created" ? "Пресет создан" : a === "preset_updated" ? "Пресет обновлён" : a === "preset_deleted" ? "Пресет удалён" : a === "user_archived" ? "Профиль в архиве" : a;
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
                    const actionLabel = e.action === "admin_login" ? "Вход в админку" : e.action === "user_register" ? "Регистрация" : e.action === "user_update" ? "Изменение" : e.action === "email_settings_saved" ? "Настройки почты" : e.action === "preset_created" ? "Пресет создан" : e.action === "preset_updated" ? "Пресет обновлён" : e.action === "preset_deleted" ? "Пресет удалён" : e.action === "user_archived" ? "Профиль в архиве" : e.action;
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

      {tab === "logs" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Журнал логов</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
            Запросы к API, завершившиеся ошибкой или отказом (4xx, 5xx)
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Поиск по пути, тексту ошибки и деталям. Затем нажмите «Обновить».
          </Typography.Body>
          <Flex className="admin-audit-toolbar" wrap="wrap" align="center" gap="0.5rem">
            <label htmlFor="error-log-search" className="visually-hidden">Поиск по журналу логов</label>
            <Input
              id="error-log-search"
              className="admin-form-input"
              placeholder="Поиск: путь, ошибка, детали..."
              value={errorLogSearch}
              onChange={(e) => setErrorLogSearch(e.target.value)}
              style={{ width: "16rem", minWidth: "12rem" }}
              aria-label="Поиск по журналу логов"
            />
            <label htmlFor="error-log-status" className="visually-hidden">Код ответа</label>
            <select
              id="error-log-status"
              className="admin-form-input"
              value={errorLogStatusFilter}
              onChange={(e) => setErrorLogStatusFilter(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Фильтр по коду ответа"
            >
              <option value="">Все коды</option>
              <option value="400">400 — Неверный запрос</option>
              <option value="401">401 — Не авторизован</option>
              <option value="403">403 — Доступ запрещён</option>
              <option value="404">404 — Не найдено</option>
              <option value="429">429 — Слишком много запросов</option>
              <option value="500">500 — Ошибка сервера</option>
              <option value="502">502 — Ошибка шлюза</option>
              <option value="503">503 — Сервис недоступен</option>
            </select>
            <label htmlFor="error-log-from-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>С:</label>
            <input
              id="error-log-from-date"
              type="date"
              className="admin-form-input"
              value={errorLogFromDate}
              onChange={(e) => setErrorLogFromDate(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Дата начала"
            />
            <label htmlFor="error-log-to-date" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>По:</label>
            <input
              id="error-log-to-date"
              type="date"
              className="admin-form-input"
              value={errorLogToDate}
              onChange={(e) => setErrorLogToDate(e.target.value)}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
              aria-label="Дата окончания"
            />
            <Button
              className="filter-button"
              style={{ background: "var(--color-primary-blue)", color: "white" }}
              onClick={() => setErrorLogFetchTrigger((t) => t + 1)}
              disabled={errorLogLoading}
            >
              {errorLogLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
            </Button>
          </Flex>
          {errorLogLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : errorLogEntries.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет записей или таблица журнала ещё не создана (миграция 023)</Typography.Body>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Время</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Метод</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Код</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Путь</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Ошибка</th>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {errorLogEntries.map((e) => {
                    const detailsStr = e.details && typeof e.details === "object" && Object.keys(e.details).length > 0
                      ? JSON.stringify(e.details).slice(0, 200) + (JSON.stringify(e.details).length > 200 ? "…" : "")
                      : "—";
                    const q = errorLogSearch.trim();
                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                          {q ? highlightMatch(new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }), q, `log-t-${e.id}`) : new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{e.method}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: e.status_code >= 500 ? "var(--color-error, #dc2626)" : undefined }}>{e.status_code}</td>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", wordBreak: "break-all" }}>
                          {q ? highlightMatch(e.path, q, `log-p-${e.id}`) : e.path}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                          {q && e.error_message ? highlightMatch(e.error_message, q, `log-m-${e.id}`) : (e.error_message ?? "—")}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--color-text-secondary)", maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis" }} title={detailsStr}>
                          {q ? highlightMatch(detailsStr, q, `log-d-${e.id}`) : detailsStr}
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

      {tab === "integrations" && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.4rem" }}>2FA / Telegram / Email / Голосовой помощник</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Сводное здоровье интеграций по последним дням: привязки, статусы, ошибки отправки и API-сбои.
          </Typography.Body>
          <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.9rem" }}>
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Период:</Typography.Body>
            <select
              className="admin-form-input"
              value={String(integrationDays)}
              onChange={(e) => setIntegrationDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30)))}
              style={{ padding: "0 0.5rem", borderRadius: "6px", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.9rem" }}
            >
              <option value="1">1 день</option>
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
              <option value="60">60 дней</option>
              <option value="90">90 дней</option>
            </select>
            <Button
              className="filter-button"
              style={{ background: "var(--color-primary-blue)", color: "white" }}
              onClick={() => setIntegrationFetchTrigger((x) => x + 1)}
              disabled={integrationLoading}
            >
              {integrationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
            </Button>
          </Flex>

          {integrationLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : !integrationHealth ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
              Нет данных по интеграциям. Проверьте, что есть доступ к БД/Redis и повторите обновление.
            </Typography.Body>
          ) : (
            <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "0.75rem" }}>
              <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>2FA / Telegram</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Привязано: {integrationHealth.telegram.linked_total}</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>active: {integrationHealth.telegram.active}</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>pending: {integrationHealth.telegram.pending}</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>disabled: {integrationHealth.telegram.disabled}</Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: "var(--color-text-secondary)" }}>
                  Средний срок активной привязки: {integrationHealth.telegram.avg_lifetime_hours_active == null ? "—" : `${integrationHealth.telegram.avg_lifetime_hours_active} ч`}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                  Среднее ожидание в pending: {integrationHealth.telegram.avg_pending_hours == null ? "—" : `${integrationHealth.telegram.avg_pending_hours} ч`}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: integrationHealth.telegram.pin_email_failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                  PIN email: отправлено {integrationHealth.telegram.pin_email_sent}, ошибок {integrationHealth.telegram.pin_email_failed}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", color: integrationHealth.telegram.webhook_errors > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                  Ошибки `/api/tg-webhook`: {integrationHealth.telegram.webhook_errors}
                </Typography.Body>
              </Panel>

              <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Email доставка</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Регистрация: {integrationHealth.email_delivery.registration.sent} / ошибок {integrationHealth.email_delivery.registration.failed}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Сброс пароля: {integrationHealth.email_delivery.password_reset.sent} / ошибок {integrationHealth.email_delivery.password_reset.failed}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Telegram PIN: {integrationHealth.email_delivery.telegram_pin.sent} / ошибок {integrationHealth.email_delivery.telegram_pin.failed}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: "var(--color-text-secondary)" }}>
                  API ошибки: register {integrationHealth.email_delivery.api_errors.register}, reset {integrationHealth.email_delivery.api_errors.reset}, tg-webhook {integrationHealth.email_delivery.api_errors.tg_webhook}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: integrationHealth.email_delivery.sendlk.failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                  SendLK: отправлено {integrationHealth.email_delivery.sendlk.sent}, ошибок {integrationHealth.email_delivery.sendlk.failed}, пропущено {integrationHealth.email_delivery.sendlk.skipped}, запусков bulk {integrationHealth.email_delivery.sendlk.bulk_runs}
                </Typography.Body>
                <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginTop: "0.45rem" }}>
                  <Button
                    type="button"
                    className="filter-button"
                    disabled={integrationSendLkSyncLoading}
                    onClick={() => void runSendLkBulkSync()}
                    style={{ padding: "0.3rem 0.55rem" }}
                  >
                    {integrationSendLkSyncLoading ? "Выгрузка..." : "Выгрузить активных в 1С (SendLK)"}
                  </Button>
                  {integrationSendLkSyncResult ? (
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                      {integrationSendLkSyncResult}
                    </Typography.Body>
                  ) : null}
                </Flex>
              </Panel>

              <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Голосовой помощник (MAX)</Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Логинов с привязкой: {integrationHealth.voice_assistant.linked_logins}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Уникальных чатов: {integrationHealth.voice_assistant.linked_chats_unique}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.3rem", color: integrationHealth.voice_assistant.link_errors > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>
                  Ошибки привязок/вебхука: {integrationHealth.voice_assistant.link_errors}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                  `max-link`: {integrationHealth.voice_assistant.max_link_errors}, `max-webhook`: {integrationHealth.voice_assistant.max_webhook_errors}
                </Typography.Body>
              </Panel>
            </div>
            <Panel className="cargo-card" style={{ padding: "0.75rem", border: "1px solid var(--color-border)", marginTop: "0.75rem" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Email доставка по дням</Typography.Body>
              {integrationHealth.email_delivery.daily.length === 0 ? (
                <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                  За выбранный период записей нет.
                </Typography.Body>
              ) : (
                <div style={{ overflowX: "auto", maxHeight: "16rem", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Отправлено</th>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Ошибок</th>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Регистрация</th>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Сброс</th>
                        <th style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontWeight: 600 }}>Telegram PIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrationHealth.email_delivery.daily.map((d) => (
                        <tr key={d.day} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.35rem 0.5rem" }}>{d.day}</td>
                          <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>{d.total_sent}</td>
                          <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: d.total_failed > 0 ? "var(--color-error, #dc2626)" : "var(--color-text-secondary)" }}>{d.total_failed}</td>
                          <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.registration_sent} / {d.registration_failed}</td>
                          <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.password_reset_sent} / {d.password_reset_failed}</td>
                          <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{d.telegram_pin_sent} / {d.telegram_pin_failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            </>
          )}
        </Panel>
      )}

      {tab === "presets" && isSuperAdmin && (
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
                      if (!isSuperAdmin && (key === "cms_access" || key === "service_mode" || key === "analytics")) return null;
                      const isActive = key === "__financial__" ? presetFormFinancial : key === "service_mode" ? (!!presetFormPermissions.service_mode || presetFormServiceMode) : !!presetFormPermissions[key];
                      const onClick = key === "__financial__" ? () => setPresetFormFinancial(!presetFormFinancial) : key === "service_mode" ? () => { const v = !(!!presetFormPermissions.service_mode || presetFormServiceMode); setPresetFormPermissions((p) => ({ ...p, service_mode: v })); setPresetFormServiceMode(v); } : () => setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }));
                      const activeClass = isActive
                        ? (key === "haulz" ? "active active-success" : key === "eor" ? "active active-eor" : "active active-danger")
                        : "";
                      return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.25rem" }}>
                    {PERMISSION_ROW2.map(({ key, label }) => (
                      <button key={key} type="button" className={`permission-button ${!!presetFormPermissions[key] ? "active" : ""}`} onClick={() => setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }))}>{label}</button>
                    ))}
                  </div>
                  {presetFormError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{presetFormError}</Typography.Body>}
                  <Flex gap="0.5rem" align="center" style={{ marginTop: "0.5rem" }}>
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
                          setPresetFormPermissions({ cms_access: false, home: true, dashboard: true, cargo: true, doc_invoices: true, doc_acts: true, doc_orders: true, doc_sendings: true, doc_claims: true, doc_contracts: true, doc_acts_settlement: true, doc_tariffs: true, haulz: false, service_mode: false, analytics: false, supervisor: false, eor: false });
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

      {tab === "subdivisions" && isSuperAdmin && (
        <div style={{ padding: "var(--pad-card, 1rem)" }}>
          <RefSubdivisionsView />
        </div>
      )}

      {tab === "employee_directory" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник сотрудников HAULZ</Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.9rem" }}>
            Назначение атрибутов сотруднику (email опционален): ФИО, структурное подразделение, должность, тип сотрудничества и роль.
          </Typography.Body>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input
              type="email"
              className="admin-form-input"
              value={employeeDirectoryEmail}
              placeholder="Email сотрудника (необязательно)"
              onChange={(e) => setEmployeeDirectoryEmail(e.target.value)}
              style={{ width: "100%" }}
              autoComplete="off"
            />
            <Input
              type="text"
              className="admin-form-input"
              value={employeeDirectoryFullName}
              placeholder="ФИО"
              onChange={(e) => setEmployeeDirectoryFullName(e.target.value)}
            />
            {employeeDirectoryRole === "department_head" ? (
              <div style={{ minWidth: 180 }}>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Подразделения (можно несколько)</label>
                <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.35rem", background: "var(--color-bg-card)" }}>
                  {(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).map((dep) => (
                    <label key={dep} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", cursor: "pointer", fontSize: "0.85rem" }}>
                      <input
                        type="checkbox"
                        checked={employeeDirectoryDepartments.includes(dep)}
                        onChange={(e) => {
                          setEmployeeDirectoryDepartments((prev) => {
                            const next = e.target.checked ? [...prev, dep] : prev.filter((d) => d !== dep);
                            if (e.target.checked && !employeeDirectoryPrimaryDepartment) {
                              setEmployeeDirectoryPrimaryDepartment(dep);
                            }
                            if (!e.target.checked && employeeDirectoryPrimaryDepartment === dep) {
                              setEmployeeDirectoryPrimaryDepartment(next[0] || "");
                            }
                            return next;
                          });
                        }}
                      />
                      {dep}
                    </label>
                  ))}
                </div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginTop: "0.35rem", marginBottom: "0.2rem" }}>Основное подразделение</label>
                <select
                  className="admin-form-input"
                  value={employeeDirectoryPrimaryDepartment}
                  onChange={(e) => setEmployeeDirectoryPrimaryDepartment(e.target.value)}
                  style={{ padding: "0 0.5rem", width: "100%" }}
                  disabled={employeeDirectoryDepartments.length === 0}
                >
                  <option value="">Выберите</option>
                  {employeeDirectoryDepartments.map((dep) => (
                    <option key={`primary-${dep}`} value={dep}>{dep}</option>
                  ))}
                </select>
              </div>
            ) : (
              <select
                className="admin-form-input"
                value={employeeDirectoryDepartment}
                onChange={(e) => setEmployeeDirectoryDepartment(e.target.value)}
                style={{ padding: "0 0.5rem" }}
                disabled={(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).length === 0}
              >
                {(employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK).map((dep) => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
            )}
            <Input
              type="text"
              className="admin-form-input"
              value={employeeDirectoryPosition}
              placeholder="Должность"
              onChange={(e) => setEmployeeDirectoryPosition(e.target.value)}
            />
            <select
              className="admin-form-input"
              value={employeeDirectoryCooperationType}
              onChange={(e) => setEmployeeDirectoryCooperationType(e.target.value as CooperationType)}
              style={{ padding: "0 0.5rem" }}
            >
              {COOPERATION_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              className="admin-form-input"
              value={employeeDirectoryAccrualType}
              onChange={(e) => setEmployeeDirectoryAccrualType(normalizeAccrualType(e.target.value))}
              style={{ padding: "0 0.5rem" }}
            >
              <option value="hour">Начисление по часам</option>
              <option value="shift">Начисление по сменам</option>
              <option value="month">Начисление за месяц (21 раб. дн.)</option>
            </select>
            <input
              type="number"
              min={0}
              step={0.01}
              className="admin-form-input"
              value={employeeDirectoryAccrualRate}
              placeholder={employeeDirectoryAccrualType === "month" ? "Ставка за месяц" : (employeeDirectoryAccrualType === "shift" ? "Ставка за смену" : "Ставка за час")}
              onChange={(e) => setEmployeeDirectoryAccrualRate(e.target.value)}
              style={{ width: "100%" }}
            />
            <select
              className="admin-form-input"
              value={employeeDirectoryRole}
              onChange={(e) => {
                const v = e.target.value as "employee" | "department_head";
                setEmployeeDirectoryRole(v);
                if (v === "department_head" && employeeDirectoryDepartments.length === 0 && employeeDirectoryDepartment) {
                  setEmployeeDirectoryDepartments([employeeDirectoryDepartment]);
                  setEmployeeDirectoryPrimaryDepartment(employeeDirectoryDepartment);
                } else if (v === "department_head" && employeeDirectoryDepartments.length > 0 && !employeeDirectoryPrimaryDepartment) {
                  setEmployeeDirectoryPrimaryDepartment(employeeDirectoryDepartments[0] || "");
                }
                if (v === "employee" && employeeDirectoryDepartments.length > 0) {
                  setEmployeeDirectoryDepartment(employeeDirectoryDepartments[0] || "");
                }
              }}
              style={{ padding: "0 0.5rem" }}
            >
              <option value="employee">Сотрудник</option>
              <option value="department_head">Руководитель подразделения</option>
            </select>
          </div>
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginTop: "-0.25rem", marginBottom: "0.55rem" }}>
            За {employeeDirectoryAccrualType === "month" ? "месяц" : (employeeDirectoryAccrualType === "shift" ? "смену" : "час")}: {Number(employeeDirectoryAccrualRate || 0).toLocaleString("ru-RU")} ₽ ·
            За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(employeeDirectoryMonthlyEstimate).toLocaleString("ru-RU")} ₽
          </Typography.Body>

          <Flex align="center" gap="0.6rem" wrap="wrap" style={{ marginBottom: "0.9rem" }}>
            <Button
              type="button"
              className="button-primary"
              disabled={employeeDirectorySaving || !employeeDirectoryFullName.trim() || !Number.isFinite(Number(employeeDirectoryAccrualRate)) || Number(employeeDirectoryAccrualRate) < 0 || (employeeDirectoryRole === "department_head" ? (employeeDirectoryDepartments.length === 0 || !employeeDirectoryPrimaryDepartment) : !employeeDirectoryDepartment)}
              onClick={async () => {
                setEmployeeDirectorySaving(true);
                setError(null);
                try {
                  const departmentValue = employeeDirectoryRole === "department_head"
                    ? [employeeDirectoryPrimaryDepartment, ...employeeDirectoryDepartments.filter((d) => d !== employeeDirectoryPrimaryDepartment)].join(", ")
                    : employeeDirectoryDepartment;
                  const res = await fetch("/api/admin-employee-directory", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({
                      email: employeeDirectoryEmail.trim() ? employeeDirectoryEmail.trim().toLowerCase() : "",
                      full_name: employeeDirectoryFullName.trim(),
                      department: departmentValue,
                      position: employeeDirectoryPosition.trim(),
                      cooperation_type: employeeDirectoryCooperationType,
                      accrual_type: employeeDirectoryAccrualType,
                      accrual_rate: Number(employeeDirectoryAccrualRate),
                      employee_role: employeeDirectoryRole,
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data?.error || "Ошибка сохранения атрибутов сотрудника");
                  setEmployeeDirectoryEmail("");
                  setEmployeeDirectoryFullName("");
                  setEmployeeDirectoryDepartment("");
                  setEmployeeDirectoryDepartments([]);
                  setEmployeeDirectoryPrimaryDepartment("");
                  setEmployeeDirectoryPosition("");
                  setEmployeeDirectoryCooperationType("staff");
                  setEmployeeDirectoryAccrualType("hour");
                  setEmployeeDirectoryAccrualRate("0");
                  await fetchEmployeeDirectory();
                } catch (e: unknown) {
                  setError((e as Error)?.message || "Ошибка сохранения атрибутов сотрудника");
                } finally {
                  setEmployeeDirectorySaving(false);
                }
              }}
            >
              {employeeDirectorySaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Сохранить атрибуты
            </Button>
          </Flex>

          {employeeDirectoryLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : employeeDirectoryItems.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Сотрудники пока не заведены.</Typography.Body>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {employeeDirectoryItems.map((emp) => (
                <div
                  key={emp.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEmployeeDirectoryEditingId(emp.id);
                    setEmployeeDirectoryEditFullName(emp.full_name || "");
                    const depStr = emp.department || (employeeDepartments[0] ?? EMPLOYEE_DEPARTMENTS_FALLBACK[0] ?? "");
                    setEmployeeDirectoryEditDepartment(depStr);
                    const depList = depStr ? depStr.split(",").map((d) => d.trim()).filter(Boolean) : [];
                    setEmployeeDirectoryEditDepartments(depList);
                    setEmployeeDirectoryEditPrimaryDepartment(depList[0] || "");
                    setEmployeeDirectoryEditPosition(emp.position || "");
                    setEmployeeDirectoryEditCooperationType(normalizeCooperationType(emp.cooperation_type || "staff"));
                    setEmployeeDirectoryEditAccrualType(normalizeAccrualType(emp.accrual_type));
                    setEmployeeDirectoryEditAccrualRate(String(emp.accrual_rate ?? 0));
                    setEmployeeDirectoryEditRole(emp.employee_role === "department_head" ? "department_head" : "employee");
                  }}
                  onKeyDown={(e) => {
                    const target = e.target as HTMLElement;
                    const tag = target?.tagName?.toLowerCase();
                    if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button") return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEmployeeDirectoryEditingId(emp.id);
                      setEmployeeDirectoryEditFullName(emp.full_name || "");
                      const depStr = emp.department || (employeeDepartments[0] ?? EMPLOYEE_DEPARTMENTS_FALLBACK[0] ?? "");
                      setEmployeeDirectoryEditDepartment(depStr);
                      const depList = depStr ? depStr.split(",").map((d) => d.trim()).filter(Boolean) : [];
                      setEmployeeDirectoryEditDepartments(depList);
                      setEmployeeDirectoryEditPrimaryDepartment(depList[0] || "");
                      setEmployeeDirectoryEditPosition(emp.position || "");
                      setEmployeeDirectoryEditCooperationType(normalizeCooperationType(emp.cooperation_type || "staff"));
                      setEmployeeDirectoryEditAccrualType(normalizeAccrualType(emp.accrual_type));
                      setEmployeeDirectoryEditAccrualRate(String(emp.accrual_rate ?? 0));
                      setEmployeeDirectoryEditRole(emp.employee_role === "department_head" ? "department_head" : "employee");
                    }
                  }}
                  style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.6rem 0.7rem", background: "var(--color-bg-hover)", cursor: "pointer" }}
                  aria-label={`Редактировать сотрудника ${emp.full_name || emp.login}`}
                >
                  <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                    <div>
                      <Typography.Body style={{ fontWeight: 600 }}>{emp.full_name || emp.login}</Typography.Body>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Подразделение: {emp.department || "—"} · Должность: {emp.position || "—"} · Тип сотрудничества: {cooperationTypeLabel(emp.cooperation_type)} · Начисление: {normalizeAccrualType(emp.accrual_type) === "month" ? "Месяц" : (isShiftAccrualType(emp.accrual_type) ? "Смена" : "Часы")} · Ставка: {emp.accrual_rate ?? 0} · Роль: {emp.employee_role === "department_head" ? "Руководитель подразделения" : "Сотрудник"} · Логин: {emp.login}
                      </Typography.Body>
                    </div>
                    <Flex align="center" gap="0.45rem" onClick={(e) => e.stopPropagation()}>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>{emp.active ? "Вкл" : "Выкл"}</Typography.Body>
                      <TapSwitch
                        checked={emp.active}
                        onToggle={async () => {
                          try {
                            const res = await fetch(`/api/admin-employee-directory?id=${emp.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                              body: JSON.stringify({ active: !emp.active }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error || "Ошибка обновления");
                            setEmployeeDirectoryItems((prev) => prev.map((x) => (x.id === emp.id ? { ...x, active: !x.active } : x)));
                          } catch (e: unknown) {
                            setError((e as Error)?.message || "Ошибка обновления");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        className="filter-button"
                        style={{ padding: "0.35rem" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(`/api/admin-employee-directory?id=${emp.id}`, {
                              method: "DELETE",
                              headers: { Authorization: `Bearer ${adminToken}` },
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error || "Ошибка удаления");
                            setEmployeeDirectoryItems((prev) => prev.filter((x) => x.id !== emp.id));
                          } catch (e: unknown) {
                            setError((e as Error)?.message || "Ошибка удаления");
                          }
                        }}
                        aria-label="Удалить сотрудника"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: "var(--color-error)" }} />
                      </Button>
                    </Flex>
                  </Flex>
                  {employeeDirectoryEditingId === emp.id && (
                    <div style={{ marginTop: "0.65rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.65rem" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.5rem" }}>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={employeeDirectoryEditFullName}
                          placeholder="ФИО"
                          onChange={(e) => setEmployeeDirectoryEditFullName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        {employeeDirectoryEditRole === "department_head" ? (
                          <div style={{ minWidth: 180 }}>
                            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Подразделения (можно несколько)</label>
                            <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.35rem", background: "var(--color-bg-card)" }}>
                              {(() => {
                                const base = employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK;
                                const opts = [...new Set([...base, ...employeeDirectoryEditDepartments])].sort((a, b) => a.localeCompare(b, "ru"));
                                return opts.map((dep) => (
                                  <label key={dep} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", cursor: "pointer", fontSize: "0.85rem" }}>
                                    <input
                                      type="checkbox"
                                      checked={employeeDirectoryEditDepartments.includes(dep)}
                                      onChange={(e) => {
                                        setEmployeeDirectoryEditDepartments((prev) => {
                                          const next = e.target.checked ? [...prev, dep] : prev.filter((d) => d !== dep);
                                          if (e.target.checked && !employeeDirectoryEditPrimaryDepartment) {
                                            setEmployeeDirectoryEditPrimaryDepartment(dep);
                                          }
                                          if (!e.target.checked && employeeDirectoryEditPrimaryDepartment === dep) {
                                            setEmployeeDirectoryEditPrimaryDepartment(next[0] || "");
                                          }
                                          return next;
                                        });
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {dep}
                                  </label>
                                ));
                              })()}
                            </div>
                            <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", display: "block", marginTop: "0.35rem", marginBottom: "0.2rem" }}>Основное подразделение</label>
                            <select
                              className="admin-form-input"
                              value={employeeDirectoryEditPrimaryDepartment}
                              onChange={(e) => setEmployeeDirectoryEditPrimaryDepartment(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ padding: "0 0.5rem", width: "100%" }}
                              disabled={employeeDirectoryEditDepartments.length === 0}
                            >
                              <option value="">Выберите</option>
                              {employeeDirectoryEditDepartments.map((dep) => (
                                <option key={`edit-primary-${dep}`} value={dep}>{dep}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <select
                            className="admin-form-input"
                            value={employeeDirectoryEditDepartment}
                            onChange={(e) => setEmployeeDirectoryEditDepartment(e.target.value)}
                            style={{ padding: "0 0.5rem" }}
                          >
                            {(() => {
                              const base = employeeDepartments.length ? employeeDepartments : EMPLOYEE_DEPARTMENTS_FALLBACK;
                              const opts = [...base];
                              if (employeeDirectoryEditDepartment && !opts.includes(employeeDirectoryEditDepartment)) opts.unshift(employeeDirectoryEditDepartment);
                              return opts.map((dep) => <option key={dep} value={dep}>{dep}</option>);
                            })()}
                          </select>
                        )}
                        <input
                          type="text"
                          className="admin-form-input"
                          value={employeeDirectoryEditPosition}
                          placeholder="Должность"
                          onChange={(e) => setEmployeeDirectoryEditPosition(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditCooperationType}
                          onChange={(e) => setEmployeeDirectoryEditCooperationType(e.target.value as CooperationType)}
                          style={{ padding: "0 0.5rem" }}
                        >
                          {COOPERATION_TYPE_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditAccrualType}
                          onChange={(e) => setEmployeeDirectoryEditAccrualType(normalizeAccrualType(e.target.value))}
                          style={{ padding: "0 0.5rem" }}
                        >
                          <option value="hour">Начисление по часам</option>
                          <option value="shift">Начисление по сменам</option>
                          <option value="month">Начисление за месяц (21 раб. дн.)</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="admin-form-input"
                          value={employeeDirectoryEditAccrualRate}
                          placeholder={employeeDirectoryEditAccrualType === "month" ? "Ставка за месяц" : (employeeDirectoryEditAccrualType === "shift" ? "Ставка за смену" : "Ставка за час")}
                          onChange={(e) => setEmployeeDirectoryEditAccrualRate(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: "100%" }}
                          autoComplete="off"
                        />
                        <select
                          className="admin-form-input"
                          value={employeeDirectoryEditRole}
                          onChange={(e) => {
                            const v = e.target.value as "employee" | "department_head";
                            setEmployeeDirectoryEditRole(v);
                            if (v === "department_head" && employeeDirectoryEditDepartments.length === 0 && employeeDirectoryEditDepartment) {
                              setEmployeeDirectoryEditDepartments([employeeDirectoryEditDepartment]);
                              setEmployeeDirectoryEditPrimaryDepartment(employeeDirectoryEditDepartment);
                            } else if (v === "department_head" && employeeDirectoryEditDepartments.length > 0 && !employeeDirectoryEditPrimaryDepartment) {
                              setEmployeeDirectoryEditPrimaryDepartment(employeeDirectoryEditDepartments[0] || "");
                            }
                            if (v === "employee" && employeeDirectoryEditDepartments.length > 0) {
                              setEmployeeDirectoryEditDepartment(employeeDirectoryEditDepartments[0] || "");
                            }
                          }}
                          style={{ padding: "0 0.5rem" }}
                        >
                          <option value="employee">Сотрудник</option>
                          <option value="department_head">Руководитель подразделения</option>
                        </select>
                      </div>
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                        За {employeeDirectoryEditAccrualType === "month" ? "месяц" : (employeeDirectoryEditAccrualType === "shift" ? "смену" : "час")}: {Number(employeeDirectoryEditAccrualRate || 0).toLocaleString("ru-RU")} ₽ ·
                        За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(employeeDirectoryEditMonthlyEstimate).toLocaleString("ru-RU")} ₽
                      </Typography.Body>
                      <Flex align="center" gap="0.5rem" style={{ marginTop: "0.55rem" }}>
                        <Button
                          type="button"
                          className="button-primary"
                          disabled={employeeDirectoryEditSaving || !Number.isFinite(Number(employeeDirectoryEditAccrualRate)) || Number(employeeDirectoryEditAccrualRate) < 0 || (employeeDirectoryEditRole === "department_head" ? (employeeDirectoryEditDepartments.length === 0 || !employeeDirectoryEditPrimaryDepartment) : !employeeDirectoryEditDepartment)}
                          onClick={async () => {
                            setEmployeeDirectoryEditSaving(true);
                            setError(null);
                            try {
                              const departmentValue = employeeDirectoryEditRole === "department_head"
                                ? [employeeDirectoryEditPrimaryDepartment, ...employeeDirectoryEditDepartments.filter((d) => d !== employeeDirectoryEditPrimaryDepartment)].join(", ")
                                : employeeDirectoryEditDepartment;
                              const res = await fetch(`/api/admin-employee-directory?id=${emp.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                                body: JSON.stringify({
                                  full_name: employeeDirectoryEditFullName.trim(),
                                  department: departmentValue,
                                  position: employeeDirectoryEditPosition.trim(),
                                  cooperation_type: employeeDirectoryEditCooperationType,
                                  accrual_type: employeeDirectoryEditAccrualType,
                                  accrual_rate: Number(employeeDirectoryEditAccrualRate),
                                  employee_role: employeeDirectoryEditRole,
                                }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data?.error || "Ошибка сохранения атрибутов");
                              setEmployeeDirectoryItems((prev) =>
                                prev.map((x) =>
                                  x.id === emp.id
                                    ? {
                                        ...x,
                                        full_name: employeeDirectoryEditFullName.trim(),
                                        department: employeeDirectoryEditRole === "department_head"
                                          ? [employeeDirectoryEditPrimaryDepartment, ...employeeDirectoryEditDepartments.filter((d) => d !== employeeDirectoryEditPrimaryDepartment)].join(", ")
                                          : employeeDirectoryEditDepartment,
                                        position: employeeDirectoryEditPosition.trim(),
                                        cooperation_type: employeeDirectoryEditCooperationType,
                                        accrual_type: employeeDirectoryEditAccrualType,
                                        accrual_rate: Number(employeeDirectoryEditAccrualRate),
                                        employee_role: employeeDirectoryEditRole,
                                      }
                                    : x
                                )
                              );
                              setEmployeeDirectoryEditingId(null);
                            } catch (e: unknown) {
                              setError((e as Error)?.message || "Ошибка сохранения атрибутов");
                            } finally {
                              setEmployeeDirectoryEditSaving(false);
                            }
                          }}
                        >
                          {employeeDirectoryEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                        </Button>
                        <Button
                          type="button"
                          className="filter-button"
                          disabled={employeeDirectoryEditSaving}
                          onClick={() => setEmployeeDirectoryEditingId(null)}
                        >
                          Отмена
                        </Button>
                      </Flex>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "accounting" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", marginBottom: "1rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Бухгалтерия — подразделы</Typography.Body>
          <Flex gap="0.5rem" wrap="wrap">
            <Button
              type="button"
              className="filter-button"
              style={{
                background: accountingSubsection === "expense_requests" ? "var(--color-primary-blue)" : undefined,
                color: accountingSubsection === "expense_requests" ? "white" : undefined,
                height: 36,
                padding: "0 0.85rem",
                minWidth: 170,
              }}
              onClick={() => setAccountingSubsection("expense_requests")}
            >
              Заявки на расходы
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: accountingSubsection === "sverki" ? "var(--color-primary-blue)" : undefined,
                color: accountingSubsection === "sverki" ? "white" : undefined,
                height: 36,
                padding: "0 0.85rem",
                minWidth: 130,
              }}
              onClick={() => setAccountingSubsection("sverki")}
            >
              Акты сверок
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: accountingSubsection === "claims" ? "var(--color-primary-blue)" : undefined,
                color: accountingSubsection === "claims" ? "white" : undefined,
                height: 36,
                padding: "0 0.85rem",
                minWidth: 120,
              }}
              onClick={() => setAccountingSubsection("claims")}
            >
              Претензии
            </Button>
          </Flex>
        </Panel>
      )}

      {(tab === "expense_requests" || (tab === "accounting" && accountingSubsection !== "claims")) && isSuperAdmin && (() => {
        const isAccounting = tab === "accounting";
        const isAccountingSverki = isAccounting && accountingSubsection === "sverki";
        const isAccountingExpenses = isAccounting && accountingSubsection === "expense_requests";
        const normalizeMatch = (value: unknown) => String(value ?? "").trim().toLowerCase();
        const resolveSubdivisionId = (departmentLabel: string) => {
          const norm = normalizeMatch(departmentLabel);
          const byLabel = SUBDIVISIONS.find((s) => normalizeMatch(s.label) === norm);
          if (byLabel) return byLabel.id;
          const byId = SUBDIVISIONS.find((s) => normalizeMatch(s.id) === norm);
          return byId?.id || "";
        };
        const hasPnlExpenseCombination = (item: ExpenseRequestItem) => {
          const subdivisionId = resolveSubdivisionId(item.department);
          const subdivision = SUBDIVISIONS.find((s) => s.id === subdivisionId);
          if (!subdivision) return false;
          const reqCategoryId = String(item.categoryId || "").trim();
          const reqCategoryName = normalizeMatch(item.categoryName);
          return pnlExpenseCategoryLinks.some((row) => {
            if (row.department !== subdivision.department) return false;
            if ((row.logisticsStage ?? null) !== (subdivision.logisticsStage ?? null)) return false;
            if (reqCategoryId && row.expenseCategoryId && String(row.expenseCategoryId) === reqCategoryId) return true;
            if (reqCategoryName && normalizeMatch(row.name) === reqCategoryName) return true;
            return false;
          });
        };
        const openPnlExpenseDirectory = (item: ExpenseRequestItem) => {
          const subdivisionId = resolveSubdivisionId(item.department) || "administration";
          setPnlExpensePrefill({
            requestId: item.id,
            expenseCategoryId: item.categoryId || undefined,
            categoryName: item.categoryName || undefined,
            subdivision: subdivisionId,
            type: "OPEX",
          });
          setTab("pnl");
        };
        const statusBadge = (s: string) => {
          const map: Record<string, { bg: string; color: string; label: string }> = isAccountingExpenses
            ? {
                draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
                pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
                approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "В банк" },
                rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
                sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Ожидает оплату" },
                paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
              }
            : {
                draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
                pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
                approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Согласовано" },
                rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
                sent: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Отправлено" },
                paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
              };
          const m = map[s] ?? map.draft;
          return <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: 999, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>{m.label}</span>;
        };
        const toggleSort = (col: typeof adminExpenseSortCol) => {
          if (adminExpenseSortCol === col) setAdminExpenseSortAsc((p) => !p);
          else { setAdminExpenseSortCol(col); setAdminExpenseSortAsc(true); }
        };
        const arrow = (col: typeof adminExpenseSortCol) => adminExpenseSortCol === col ? (adminExpenseSortAsc ? " ▲" : " ▼") : "";
        const loginToFullName = Object.fromEntries(
          employeeDirectoryItems.map((e) => [e.login.trim().toLowerCase(), e.full_name?.trim() || e.login])
        ) as Record<string, string>;
        const getLoginDisplayName = (login: string) =>
          loginToFullName[login?.trim().toLowerCase() ?? ""] || login || "—";
        const baseFiltered = isAccountingExpenses ? adminExpenseRequests.filter((r) => r.status === "approved" || r.status === "sent" || r.status === "paid") : adminExpenseRequests;
        const filtered = baseFiltered.filter((r) => {
          if (expenseFilterDate && (r as any).period !== expenseFilterDate) return false;
          if (expenseFilterDepartment && r.department !== expenseFilterDepartment) return false;
          if (expenseFilterCategory && r.categoryName !== expenseFilterCategory) return false;
          if (expenseFilterVehicle && r.vehicleOrEmployee !== expenseFilterVehicle) return false;
          if (expenseFilterEmployee && (r as any).employeeName !== expenseFilterEmployee) return false;
          if (expenseFilterStatus && r.status !== expenseFilterStatus) return false;
          return true;
        });
        const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
        const depOptions = [...new Set(baseFiltered.map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
        const catOptions = [...new Set(baseFiltered.map((r) => r.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
        const vehicleOptions = [...new Set(baseFiltered.map((r) => r.vehicleOrEmployee).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
        const employeeOptions = [...new Set(baseFiltered.map((r) => (r as any).employeeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
        const statusOptions = [...new Set(baseFiltered.map((r) => r.status))].sort();
        const sorted = [...filtered].sort((a, b) => {
          const dir = adminExpenseSortAsc ? 1 : -1;
          if (adminExpenseSortCol === "amount") return (a.amount - b.amount) * dir;
          const av = String((a as any)[adminExpenseSortCol] ?? "");
          const bv = String((b as any)[adminExpenseSortCol] ?? "");
          return av.localeCompare(bv, "ru") * dir;
        });
        const title = isAccountingSverki ? "Бухгалтерия — акты сверок" : isAccountingExpenses ? `Бухгалтерия — согласованные заявки (${filtered.length})` : "Заявки на расходы";
        const statusLabels: Record<string, string> = isAccountingExpenses
          ? { draft: "Черновик", pending_approval: "На согласовании", approved: "В банк", rejected: "Отклонено", sent: "Ожидает оплату", paid: "Оплачено" }
          : { draft: "Черновик", pending_approval: "На согласовании", approved: "Согласовано", rejected: "Отклонено", sent: "Отправлено", paid: "Оплачено" };
        return (
          <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{title}</Typography.Body>
            {isAccountingSverki && (
              <div style={{ marginBottom: "1rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.75rem" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Акты сверок — заявки на формирование</Typography.Body>
                {sverkiRequestsLoading ? (
                  <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Typography.Body style={{ fontSize: "0.82rem" }}>Загрузка заявок...</Typography.Body>
                  </Flex>
                ) : sverkiRequests.length === 0 ? (
                  <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Заявок пока нет</Typography.Body>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                      <thead>
                        <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Создано</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Логин</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>ИНН</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Договор</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Период</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sverkiRequests.map((r) => {
                          const isPending = r.status === "pending";
                          return (
                            <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString("ru-RU")}</td>
                              <td style={{ padding: "6px 8px" }}>{r.login || "—"}</td>
                              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.customerInn || "—"}</td>
                              <td style={{ padding: "6px 8px" }}>{r.contract || "—"}</td>
                              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                {new Date(r.periodFrom).toLocaleDateString("ru-RU")} - {new Date(r.periodTo).toLocaleDateString("ru-RU")}
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <span style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: 999,
                                  fontWeight: 600,
                                  background: isPending ? "rgba(59,130,246,0.15)" : "rgba(16,185,129,0.15)",
                                  color: isPending ? "#3b82f6" : "#10b981",
                                  whiteSpace: "nowrap",
                                }}>
                                  {isPending ? "Ожидает формирования" : "Отправлена в ЭДО"}
                                </span>
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <Flex gap="0.35rem" wrap="wrap">
                                  {isPending && (
                                    <button
                                      type="button"
                                      onClick={() => markSverkiRequestAsSent(r.id)}
                                      disabled={sverkiRequestsUpdatingId === r.id}
                                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}
                                    >
                                      {sverkiRequestsUpdatingId === r.id ? "..." : "Сформировано"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => deleteSverkiRequest(r.id)}
                                    disabled={sverkiRequestsUpdatingId === r.id}
                                    style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                                  >
                                    Удалить
                                  </button>
                                </Flex>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {!isAccountingSverki && (
              <>
            <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Дата (период)</label>
                <input type="month" className="admin-form-input" value={expenseFilterDate} onChange={(e) => setExpenseFilterDate(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32 }} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Подразделение</label>
                <select className="admin-form-input" value={expenseFilterDepartment} onChange={(e) => setExpenseFilterDepartment(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
                  <option value="">Все</option>
                  {depOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Статья</label>
                <select className="admin-form-input" value={expenseFilterCategory} onChange={(e) => setExpenseFilterCategory(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
                  <option value="">Все</option>
                  {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>ТС</label>
                <select className="admin-form-input" value={expenseFilterVehicle} onChange={(e) => setExpenseFilterVehicle(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 120 }}>
                  <option value="">Все</option>
                  {vehicleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Сотрудник</label>
                <select className="admin-form-input" value={expenseFilterEmployee} onChange={(e) => setExpenseFilterEmployee(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
                  <option value="">Все</option>
                  {employeeOptions.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Действия</label>
                <select className="admin-form-input" value={expenseFilterStatus} onChange={(e) => setExpenseFilterStatus(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
                  <option value="">Все</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{statusLabels[s] ?? s}</option>)}
                </select>
              </div>
            </Flex>

            <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--color-bg-hover)", borderRadius: 8, fontSize: "0.9rem", fontWeight: 600 }}>
              Итого: {totalAmount.toLocaleString("ru-RU")} ₽
            </div>

            {filtered.length === 0 ? (
              <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Нет заявок</Typography.Body>
            ) : (
              <div style={{ maxHeight: 600, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: "var(--color-bg-card, #fff)", zIndex: 1 }}>
                      {([
                        ["createdAt", "Создано"],
                        ["docNumber", "№ док."],
                        ["docDate", "Дата док."],
                        ["period", "Период"],
                        ["login", "ФИО"],
                        ["department", "Подразделение"],
                        ["categoryName", "Статья"],
                        ["amount", "Сумма"],
                        ["status", "Статус"],
                      ] as [typeof adminExpenseSortCol, string][]).map(([col, label]) => (
                        <th key={col} onClick={() => toggleSort(col)} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>{label}{arrow(col)}</th>
                      ))}
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Комментарий</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>ТС</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Сотрудник</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Поставщик услуг</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Вложения</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr
                        key={r.id}
                        style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                        onClick={() => setExpenseViewId(r.id)}
                      >
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).docNumber || "—"}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).docDate ? new Date((r as any).docDate + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).period || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{getLoginDisplayName(r.login)}</td>
                        <td style={{ padding: "6px 8px" }}>{r.department}</td>
                        <td style={{ padding: "6px 8px" }}>{r.categoryName}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.amount.toLocaleString("ru-RU")} ₽{(r as any).vatRate ? ` (${(r as any).vatRate}%)` : ""}</td>
                        <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.comment || "—"}
                          {(r as any).rejectionReason && <div style={{ fontSize: "0.68rem", color: "#ef4444" }}>Причина: {(r as any).rejectionReason}</div>}
                        </td>
                        <td style={{ padding: "6px 8px" }}>{r.vehicleOrEmployee || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{(r as any).employeeName || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>
                          {(() => {
                            const sn = (r as any).supplierName;
                            const inn = (r as any).supplierInn;
                            return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                          })()}
                        </td>
                        <td style={{ padding: "6px 8px", fontSize: "0.7rem" }} onClick={(e) => e.stopPropagation()}>
                          {(r as any).attachments?.length
                            ? (r as any).attachments.map((att: { id?: number; fileName?: string; name?: string; dataUrl?: string }, i: number) => (
                                <React.Fragment key={att.id ?? att.fileName ?? att.name ?? i}>
                                  {i > 0 && ", "}
                                  <button
                                    type="button"
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      if (att.dataUrl) {
                                        const a = document.createElement("a");
                                        a.href = att.dataUrl;
                                        a.download = att.name ?? att.fileName ?? "file";
                                        a.click();
                                      } else if (att.id != null && adminToken) {
                                        try {
                                          const res = await fetch(
                                            `/api/admin-expense-attachment?requestUid=${encodeURIComponent(r.id)}&attachmentId=${att.id}`,
                                            { headers: { Authorization: `Bearer ${adminToken}` } }
                                          );
                                          if (!res.ok) return;
                                          const blob = await res.blob();
                                          const url = URL.createObjectURL(blob);
                                          window.open(url, "_blank", "noopener");
                                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                                        } catch { /* ignore */ }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-primary-blue, #2563eb)", textDecoration: "underline", fontSize: "inherit" }}
                                  >
                                    {att.fileName ?? att.name ?? "файл"}
                                  </button>
                                </React.Fragment>
                              ))
                            : r.attachmentNames.length > 0
                              ? r.attachmentNames.join(", ")
                              : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                          <Flex gap="0.25rem" wrap="wrap">
                            {!hasPnlExpenseCombination(r) && (
                              <button
                                type="button"
                                onClick={() => openPnlExpenseDirectory(r)}
                                style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #f97316", background: "rgba(249,115,22,0.12)", color: "#c2410c", cursor: "pointer", fontWeight: 600 }}
                              >
                                Добавить в PnL
                              </button>
                            )}
                            {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                              <button type="button" onClick={() => updateExpenseStatus(r.id, (r as any).login ?? "", "approved", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}>Согласовать</button>
                            )}
                            {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                              <button type="button" onClick={() => { setExpenseRejectId(r.id); setExpenseRejectComment(""); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Отказать</button>
                            )}
                            {isAccounting && r.status === "approved" && (
                              <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "sent", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}>Ожидает оплату</button>
                            )}
                            {isAccounting && (r.status === "approved" || r.status === "sent") && (
                              <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "paid", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>Оплачено</button>
                            )}
                            <button type="button" onClick={() => { setExpenseEditId(r.id); setExpenseEditDocNumber((r as any).docNumber ?? ""); setExpenseEditDocDate((r as any).docDate ?? ""); setExpenseEditPeriod((r as any).period ?? ""); setExpenseEditDepartment(r.department); setExpenseEditCategory(r.categoryId); setExpenseEditAmount(String(r.amount)); setExpenseEditVatRate((r as any).vatRate ?? ""); setExpenseEditComment(r.comment); setExpenseEditVehicle(r.vehicleOrEmployee); setExpenseEditEmployee((r as any).employeeName ?? ""); setExpenseEditSupplierName((r as any).supplierName ?? ""); setExpenseEditSupplierInn((r as any).supplierInn ?? ""); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer" }}>Изменить</button>
                            <button type="button" onClick={() => { if (window.confirm("Удалить заявку? Действие нельзя отменить.")) deleteExpenseRequest(r.id, r.login); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Удалить</button>
                          </Flex>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </>
            )}

            {/* View modal */}
            {expenseViewId && (() => {
              const item = adminExpenseRequests.find((r) => r.id === expenseViewId);
              if (!item) return null;
              const atts = (item as any).attachments ?? [];
              return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseViewId(null)}>
                  <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                      Заявка {(item as any).docNumber || item.id.slice(-8)}
                    </Typography.Body>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>№ док.:</span> {(item as any).docNumber || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Дата док.:</span> {(item as any).docDate || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Период:</span> {(item as any).period || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>ФИО:</span> {getLoginDisplayName(item.login)}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Подразделение:</span> {item.department || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Статья:</span> {item.categoryName || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Сумма:</span> {item.amount.toLocaleString("ru-RU")} ₽</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Статус:</span> {statusBadge(item.status)}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Комментарий:</span> {item.comment || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>ТС:</span> {item.vehicleOrEmployee || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Сотрудник:</span> {(item as any).employeeName || "—"}</div>
                      <div><span style={{ color: "var(--color-text-secondary)" }}>Поставщик услуг:</span> {(() => {
                        const sn = (item as any).supplierName;
                        const inn = (item as any).supplierInn;
                        return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                      })()}</div>
                      <div>
                        <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>Прикреплённые документы</Typography.Body>
                        {atts.length > 0 ? (
                          atts.map((att: { id: number; fileName: string }) => (
                            <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                              <Typography.Body style={{ fontSize: "0.82rem", minWidth: 0, flex: "1 1 200px" }}>{att.fileName}</Typography.Body>
                              <Flex gap="0.25rem">
                                <button
                                  type="button"
                                  className="filter-button"
                                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                                  onClick={async () => {
                                    if (!adminToken) return;
                                    try {
                                      const res = await fetch(
                                        `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                        { headers: { Authorization: `Bearer ${adminToken}` } }
                                      );
                                      if (!res.ok) return;
                                      const blob = await res.blob();
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, "_blank", "noopener");
                                      setTimeout(() => URL.revokeObjectURL(url), 60000);
                                    } catch { /* ignore */ }
                                  }}
                                >
                                  Открыть
                                </button>
                                <button
                                  type="button"
                                  className="filter-button"
                                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                                  onClick={async () => {
                                    if (!adminToken) return;
                                    try {
                                      const res = await fetch(
                                        `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                        { headers: { Authorization: `Bearer ${adminToken}` } }
                                      );
                                      if (!res.ok) return;
                                      const blob = await res.blob();
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = att.fileName || "файл";
                                      a.click();
                                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                                    } catch { /* ignore */ }
                                  }}
                                >
                                  Скачать
                                </button>
                              </Flex>
                            </div>
                          ))
                        ) : (
                          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                            Нет. Вложения сохраняются в БД при отправке заявки «На согласование» из мини-приложения. Заявки, созданные до обновления, могли не содержать файлов.
                          </Typography.Body>
                        )}
                      </div>
                    </div>
                    <Flex gap="0.5rem" justify="flex-end">
                      <Button type="button" className="filter-button" onClick={() => setExpenseViewId(null)}>Закрыть</Button>
                      <Button type="button" className="filter-button" onClick={() => { setExpenseViewId(null); setExpenseEditId(item.id); setExpenseEditDocNumber((item as any).docNumber ?? ""); setExpenseEditDocDate((item as any).docDate ?? ""); setExpenseEditPeriod((item as any).period ?? ""); setExpenseEditDepartment(item.department); setExpenseEditCategory(item.categoryId); setExpenseEditAmount(String(item.amount)); setExpenseEditVatRate((item as any).vatRate ?? ""); setExpenseEditComment(item.comment); setExpenseEditVehicle(item.vehicleOrEmployee); setExpenseEditEmployee((item as any).employeeName ?? ""); setExpenseEditSupplierName((item as any).supplierName ?? ""); setExpenseEditSupplierInn((item as any).supplierInn ?? ""); }}>Изменить</Button>
                    </Flex>
                  </div>
                </div>
              );
            })()}

            {/* Reject modal */}
            {expenseRejectId && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseRejectId(null)}>
                <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Отказать в заявке</Typography.Body>
                  <textarea
                    placeholder="Причина отказа (обязательно)"
                    value={expenseRejectComment}
                    onChange={(e) => setExpenseRejectComment(e.target.value)}
                    className="admin-form-input"
                    style={{ width: "100%", minHeight: 80, resize: "vertical", marginBottom: "0.75rem" }}
                    rows={3}
                    autoFocus
                  />
                  <Flex gap="0.5rem" justify="flex-end">
                    <Button type="button" className="filter-button" onClick={() => setExpenseRejectId(null)}>Отмена</Button>
                    <Button type="button" className="filter-button" style={{ background: "#ef4444", color: "white" }} disabled={!expenseRejectComment.trim()} onClick={() => {
                      const item = adminExpenseRequests.find((r) => r.id === expenseRejectId);
                      if (item) updateExpenseStatus(item.id, item.login, "rejected", expenseRejectComment.trim(), item);
                      setExpenseRejectId(null);
                    }}>Отказать</Button>
                  </Flex>
                </div>
              </div>
            )}

            {/* Edit modal */}
            {expenseEditId && (() => {
              const item = adminExpenseRequests.find((r) => r.id === expenseEditId);
              if (!item) return null;
              const fieldLabel = { fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block" as const, marginBottom: "0.15rem" };
              const fieldInput = { width: "100%", padding: "0.45rem", height: 36, boxSizing: "border-box" as const };
              return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseEditId(null)}>
                  <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Изменить заявку #{expenseEditDocNumber || item.id.slice(-6)}</Typography.Body>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 40%", minWidth: 120 }}>
                          <label style={fieldLabel}>№ документа</label>
                          <input type="text" className="admin-form-input" value={expenseEditDocNumber} onChange={(e) => setExpenseEditDocNumber(e.target.value)} style={fieldInput} />
                        </div>
                        <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                          <label style={fieldLabel}>Дата документа</label>
                          <input type="date" className="admin-form-input" value={expenseEditDocDate} onChange={(e) => setExpenseEditDocDate(e.target.value)} style={fieldInput} />
                        </div>
                        <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                          <label style={fieldLabel}>Период</label>
                          <input type="month" className="admin-form-input" value={expenseEditPeriod} onChange={(e) => setExpenseEditPeriod(e.target.value)} style={fieldInput} />
                        </div>
                      </div>
                      <div>
                        <label style={fieldLabel}>Подразделение</label>
                        <input type="text" className="admin-form-input" value={expenseEditDepartment} onChange={(e) => setExpenseEditDepartment(e.target.value)} style={fieldInput} />
                      </div>
                      <div>
                        <label style={fieldLabel}>Статья расхода</label>
                        <select className="admin-form-input" value={expenseEditCategory} onChange={(e) => setExpenseEditCategory(e.target.value)} style={{ ...fieldInput, height: 36 }}>
                          {CATEGORIES_LIST.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 55%", minWidth: 120 }}>
                          <label style={fieldLabel}>Сумма (₽)</label>
                          <input type="text" inputMode="decimal" className="admin-form-input" value={expenseEditAmount} onChange={(e) => setExpenseEditAmount(e.target.value)} style={fieldInput} />
                        </div>
                        <div style={{ flex: "1 1 40%", minWidth: 100 }}>
                          <label style={fieldLabel}>НДС</label>
                          <select className="admin-form-input" value={expenseEditVatRate} onChange={(e) => setExpenseEditVatRate(e.target.value)} style={{ ...fieldInput, height: 36 }}>
                            <option value="">Без НДС</option>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="7">7%</option>
                            <option value="10">10%</option>
                            <option value="20">20%</option>
                            <option value="22">22%</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={fieldLabel}>Транспортное средство</label>
                        <input
                          list="expense-edit-vehicle-list"
                          type="text"
                          className="admin-form-input"
                          value={expenseEditVehicle}
                          onChange={(e) => setExpenseEditVehicle(e.target.value)}
                          style={fieldInput}
                          placeholder="Выберите или введите номер / модель ТС"
                        />
                        <datalist id="expense-edit-vehicle-list">
                          {[...new Set(adminExpenseRequests.map((r) => (r as any).vehicleOrEmployee).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru")).map((v) => (
                            <option key={v} value={v} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label style={fieldLabel}>Сотрудник</label>
                        <select
                          className="admin-form-input"
                          value={expenseEditEmployee}
                          onChange={(e) => setExpenseEditEmployee(e.target.value)}
                          style={{ ...fieldInput, height: 36 }}
                        >
                          <option value="">—</option>
                          {(() => {
                            const names = employeeDirectoryItems.map((e) => e.full_name || e.login).filter(Boolean);
                            const uniq = [...new Set(names)];
                            const opts = [...uniq];
                            if (expenseEditEmployee && !opts.includes(expenseEditEmployee)) opts.unshift(expenseEditEmployee);
                            return opts.map((n) => <option key={n} value={n}>{n}</option>);
                          })()}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <label style={fieldLabel}>Поставщик услуг (название)</label>
                          <input type="text" className="admin-form-input" value={expenseEditSupplierName} onChange={(e) => setExpenseEditSupplierName(e.target.value)} style={fieldInput} placeholder="Название поставщика" />
                        </div>
                        <div style={{ flex: "0 1 140px", minWidth: 100 }}>
                          <label style={fieldLabel}>ИНН поставщика</label>
                          <input type="text" className="admin-form-input" value={expenseEditSupplierInn} onChange={(e) => setExpenseEditSupplierInn(e.target.value)} style={fieldInput} placeholder="ИНН" />
                        </div>
                      </div>
                      <div>
                        <label style={fieldLabel}>Комментарий</label>
                        <textarea value={expenseEditComment} onChange={(e) => setExpenseEditComment(e.target.value)} className="admin-form-input" style={{ width: "100%", minHeight: 60, resize: "vertical" }} rows={2} />
                      </div>
                    </div>
                    <Flex gap="0.5rem" justify="flex-end">
                      <Button type="button" className="filter-button" onClick={() => setExpenseEditId(null)}>Отмена</Button>
                      <Button type="button" className="filter-button" style={{ background: "var(--color-primary-blue)", color: "white" }} onClick={() => saveExpenseEdit(item.id, item.login)}>Сохранить</Button>
                    </Flex>
                  </div>
                </div>
              );
            })()}
          </Panel>
        );
      })()}

      {tab === "accounting" && accountingSubsection === "claims" && isSuperAdmin && (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: "1rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            {tab === "accounting" ? "Претензии (финансовый контур)" : "Претензии (менеджер / руководитель)"}
          </Typography.Body>
          <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "new" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "new" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 68,
                padding: "0 0.7rem",
              }}
              onClick={() => { setAdminClaimsView("new"); setAdminClaimsStatusFilter(""); }}
            >
              Новые
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "in_progress" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "in_progress" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 82,
                padding: "0 0.7rem",
              }}
              onClick={() => { setAdminClaimsView("in_progress"); setAdminClaimsStatusFilter(""); }}
            >
              В работе
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "all" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "all" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 56,
                padding: "0 0.7rem",
              }}
              onClick={() => setAdminClaimsView("all")}
            >
              Все
            </Button>
          </Flex>
          {adminClaimsKpi && (
            <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Активные: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.activeCount || 0)}</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Просроченные: <strong style={{ color: Number(adminClaimsKpi.overdueCount || 0) > 0 ? "#ef4444" : "var(--color-text-primary)" }}>{Number(adminClaimsKpi.overdueCount || 0)}</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 170, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Сумма требований: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.requestedSum || 0).toLocaleString("ru-RU")} ₽</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 190, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Сумма одобренных: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.approvedSum || 0).toLocaleString("ru-RU")} ₽</strong>
                </Typography.Body>
              </div>
            </Flex>
          )}
          {adminClaimsChart.length > 0 && (
            <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}>
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.3rem" }}>
                Динамика за 30 дней
              </Typography.Body>
              <Flex gap="0.4rem" wrap="wrap">
                {adminClaimsChart.slice(-14).map((p) => (
                  <span key={p.day} style={{ fontSize: "0.72rem", padding: "0.12rem 0.42rem", borderRadius: 999, background: "var(--color-bg-hover)", border: "1px solid var(--color-border)" }}>
                    {String(p.day).slice(5)}: {Number(p.count || 0)}
                  </span>
                ))}
              </Flex>
            </div>
          )}
          <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              className="admin-form-input"
              placeholder="Поиск: номер претензии / перевозка / заказчик"
              value={adminClaimsSearch}
              onChange={(e) => setAdminClaimsSearch(e.target.value)}
              style={{ minWidth: 280, maxWidth: 420, height: CLAIMS_FILTER_CONTROL_HEIGHT, padding: "0 0.55rem", boxSizing: "border-box" }}
            />
            <select
              className="admin-form-input"
              value={adminClaimsStatusFilter}
              onChange={(e) => { setAdminClaimsView("all"); setAdminClaimsStatusFilter(e.target.value); }}
              style={{ padding: "0 0.5rem", height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 210, boxSizing: "border-box" }}
            >
              <option value="">Все статусы</option>
              <option value="new">Новая</option>
              <option value="under_review">На рассмотрении</option>
              <option value="waiting_docs">Ожидает документы</option>
              <option value="in_progress">В работе</option>
              <option value="awaiting_leader">Ожидает решения руководителя</option>
              <option value="sent_to_accounting">Передана в бухгалтерию</option>
              <option value="approved">Удовлетворена</option>
              <option value="paid">Выплачено</option>
              <option value="offset">Зачтено</option>
              <option value="rejected">Отказ</option>
            </select>
            <Button
              type="button"
              className="filter-button"
              style={{ height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 92, padding: "0 0.65rem" }}
              onClick={() => reloadAdminClaims()}
              disabled={adminClaimsLoading}
            >
              {adminClaimsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
            </Button>
          </Flex>
          {adminClaimsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка претензий...</Typography.Body>
            </Flex>
          ) : adminClaims.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              Претензий не найдено
            </Typography.Body>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Претензия</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Заказчик</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Перевозка</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Сумма</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Дней</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {adminClaims.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }} onClick={() => setAdminClaimDetailId(c.id)}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.claimNumber || `#${c.id}`}</td>
                      <td style={{ padding: "6px 8px" }}>{c.customerCompanyName || c.customerInn || "—"}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.cargoNumber || "—"}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {c.approvedAmount != null ? `${Number(c.approvedAmount).toLocaleString("ru-RU")} ₽` : c.requestedAmount != null ? `${Number(c.requestedAmount).toLocaleString("ru-RU")} ₽` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          className="role-badge"
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            padding: "0.15rem 0.35rem",
                            borderRadius: "999px",
                            background: c.status === "rejected"
                              ? "rgba(239, 68, 68, 0.2)"
                              : c.status === "approved" || c.status === "paid" || c.status === "offset"
                                ? "rgba(34, 197, 94, 0.2)"
                                : "rgba(59, 130, 246, 0.15)",
                            color: c.status === "rejected"
                              ? "#ef4444"
                              : c.status === "approved" || c.status === "paid" || c.status === "offset"
                                ? "#22c55e"
                                : "var(--color-primary-blue)",
                            border: "1px solid var(--color-border)",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {CLAIM_STATUS_LABELS_RU[String(c.status || "")] || c.status || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: c.daysInWork > 10 ? "#ef4444" : undefined }}>{c.daysInWork}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <Flex gap="0.25rem" wrap="wrap">
                          {(c.status === "approved" || c.status === "sent_to_accounting") && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "paid", c.approvedAmount); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}
                            >
                              Оплачено
                            </button>
                          )}
                          {(c.status === "approved" || c.status === "sent_to_accounting") && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "offset", c.approvedAmount); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}
                            >
                              Зачтено
                            </button>
                          )}
                          {c.status !== "rejected" && c.status !== "paid" && c.status !== "offset" && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "rejected"); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}
                            >
                              Отказ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteAdminClaim(c.id); }}
                            disabled={adminClaimsUpdatingId === c.id}
                            style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                          >
                            Удалить
                          </button>
                        </Flex>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {adminClaimDetailId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setAdminClaimDetailId(null)}
        >
          <div
            style={{ width: "94%", maxWidth: 820, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "var(--color-bg-card, #fff)", padding: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Flex align="center" justify="space-between" style={{ marginBottom: "0.65rem" }}>
              <Typography.Body style={{ fontWeight: 700 }}>
                Претензия {adminClaimDetail?.claim?.claimNumber || `#${adminClaimDetailId}`}
              </Typography.Body>
              <Flex gap="0.45rem" align="center">
                {isSuperAdmin && adminClaimDetail?.claim?.id && (
                  <Button
                    type="button"
                    className="filter-button"
                    style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                    onClick={() => deleteAdminClaim(Number(adminClaimDetail.claim.id))}
                    disabled={adminClaimsUpdatingId === Number(adminClaimDetail.claim.id)}
                  >
                    Удалить
                  </Button>
                )}
                <Button type="button" className="filter-button" onClick={() => setAdminClaimDetailId(null)}>Закрыть</Button>
              </Flex>
            </Flex>
            {adminClaimDetailLoading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка карточки...</Typography.Body>
              </Flex>
            ) : !adminClaimDetail?.claim ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Данные не загружены</Typography.Body>
            ) : (
              <>
                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Данные клиента и претензии</Typography.Body>
                  <div style={{ display: "grid", gap: "0.28rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Заказчик:</strong> {adminClaimDetail.claim.customerCompanyName || "—"} ({adminClaimDetail.claim.customerInn || "—"})
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Контакты:</strong> {adminClaimDetail.claim.customerPhone || "—"} | {adminClaimDetail.claim.customerEmail || "—"}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Перевозка:</strong>{" "}
                      {adminClaimDetail.claim.cargoNumber ? (
                        <a
                          href={`/documents?section=%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8&search=${encodeURIComponent(String(adminClaimDetail.claim.cargoNumber || ""))}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--color-primary-blue)", textDecoration: "underline", fontWeight: 600 }}
                        >
                          {adminClaimDetail.claim.cargoNumber}
                        </a>
                      ) : "—"}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Тип претензии:</strong> {String(adminClaimDetail?.claimTypeLabel || "—")}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Статус:</strong> {CLAIM_STATUS_LABELS_RU[String(adminClaimDetail.claim.status || "")] || adminClaimDetail.claim.status || "—"}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Описание:</strong> {adminClaimDetail.claim.description || "—"}
                    </Typography.Body>
                  </div>
                  {!!adminClaimDetail?.customerPayload && (
                    <div style={{ marginTop: "0.45rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.45rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
                        Данные от заказчика
                      </Typography.Body>
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Контактное лицо:</strong> {String(adminClaimDetail.customerPayload?.contactName || "—")}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Номера мест:</strong> {Array.isArray(adminClaimDetail.customerPayload?.selectedPlaces) && adminClaimDetail.customerPayload.selectedPlaces.length > 0
                            ? adminClaimDetail.customerPayload.selectedPlaces.join(", ")
                            : "—"}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Манипуляционные знаки:</strong> {Array.isArray(adminClaimDetail.customerPayload?.manipulationSigns) && adminClaimDetail.customerPayload.manipulationSigns.length > 0
                            ? mapClaimEnumValuesToRu(adminClaimDetail.customerPayload.manipulationSigns, CLAIM_MANIPULATION_SIGN_LABELS_RU).join(", ")
                            : "—"}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Упаковка:</strong> {Array.isArray(adminClaimDetail.customerPayload?.packagingTypes) && adminClaimDetail.customerPayload.packagingTypes.length > 0
                            ? mapClaimEnumValuesToRu(adminClaimDetail.customerPayload.packagingTypes, CLAIM_PACKAGING_TYPE_LABELS_RU).join(", ")
                            : "—"}
                        </Typography.Body>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Ответ заказчику</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.82rem" }}>
                    Фото: {Array.isArray(adminClaimDetail.photos) ? adminClaimDetail.photos.length : 0} |
                    PDF: {Array.isArray(adminClaimDetail.documents) ? adminClaimDetail.documents.length : 0} |
                    Видео-ссылки: {Array.isArray(adminClaimDetail.videoLinks) ? adminClaimDetail.videoLinks.length : 0}
                  </Typography.Body>
                  <div style={{ marginTop: "0.55rem", border: "1px dashed var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}>
                      Комментарий и вложения от лица менеджера/руководителя
                    </Typography.Body>
                    <Flex gap="0.45rem" wrap="wrap" align="center" style={{ marginBottom: "0.4rem" }}>
                      <select
                        className="admin-form-input"
                        value={adminClaimAttachRole}
                        onChange={(e) => setAdminClaimAttachRole(e.target.value === "leader" ? "leader" : "manager")}
                        style={{ minWidth: 190, padding: "0.35rem 0.45rem" }}
                      >
                        <option value="manager">От имени менеджера</option>
                        <option value="leader">От имени руководителя</option>
                      </select>
                      <Button
                        type="button"
                        className="filter-button"
                        onClick={() => updateAdminClaimStatus(
                          adminClaimDetail.claim.id,
                          String(adminClaimDetail.claim.status || "in_progress"),
                          Number(adminClaimApprovedAmountDraft || 0),
                          {
                            expertLogin: String(adminClaimDetail?.claim?.expertLogin || "").trim(),
                            managerNote: adminClaimAttachRole === "manager" ? adminClaimNoteDraft.trim() : undefined,
                            leaderComment: adminClaimAttachRole === "leader" ? adminLeaderCommentDraft.trim() : undefined,
                          }
                        )}
                        disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                      >
                        Сохранить комментарий
                      </Button>
                    </Flex>
                    <textarea
                      className="admin-form-input"
                      rows={3}
                      placeholder={adminClaimAttachRole === "leader" ? "Комментарий руководителя для заказчика" : "Комментарий менеджера для заказчика"}
                      value={adminClaimAttachRole === "leader" ? adminLeaderCommentDraft : adminClaimNoteDraft}
                      onChange={(e) => {
                        if (adminClaimAttachRole === "leader") setAdminLeaderCommentDraft(e.target.value);
                        else setAdminClaimNoteDraft(e.target.value);
                      }}
                      style={{ width: "100%", marginBottom: "0.45rem" }}
                    />
                    <Flex gap="0.45rem" wrap="wrap" align="center" style={{ marginBottom: "0.4rem" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setAdminClaimAttachPhotoFiles(Array.from(e.target.files || []))}
                        />
                        Фото ({adminClaimAttachPhotoFiles.length})
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          multiple
                          onChange={(e) => setAdminClaimAttachDocumentFiles(Array.from(e.target.files || []))}
                        />
                        PDF ({adminClaimAttachDocumentFiles.length})
                      </label>
                    </Flex>
                    <input
                      className="admin-form-input"
                      type="url"
                      placeholder="Ссылка на видео (опционально)"
                      value={adminClaimAttachVideoLink}
                      onChange={(e) => setAdminClaimAttachVideoLink(e.target.value)}
                      style={{ width: "100%", marginBottom: "0.4rem" }}
                    />
                    {adminClaimAttachError && (
                      <Typography.Body style={{ fontSize: "0.76rem", color: "#b91c1c", marginBottom: "0.35rem" }}>
                        {adminClaimAttachError}
                      </Typography.Body>
                    )}
                    <Flex justify="flex-end">
                      <Button
                        type="button"
                        className="filter-button"
                        onClick={uploadAdminClaimDocuments}
                        disabled={adminClaimAttachSubmitting}
                      >
                        {adminClaimAttachSubmitting ? "Загрузка..." : "Отправить файлы заказчику"}
                      </Button>
                    </Flex>
                    <Flex gap="0.45rem" wrap="wrap" style={{ marginTop: "0.55rem", paddingTop: "0.55rem", borderTop: "1px dashed var(--color-border)" }}>
                      <Button
                        type="button"
                        className="filter-button"
                        onClick={() => setAdminRequestDocsOpen((prev) => !prev)}
                        disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                      >
                        Запросить документы
                      </Button>
                      <Button
                        type="button"
                        className="filter-button"
                        onClick={() => setAdminDelegateOpen((prev) => !prev)}
                        disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                      >
                        Подключить сотрудника
                      </Button>
                    </Flex>
                    {adminDelegateOpen && (
                      <div style={{ marginTop: "0.55rem", border: "1px dashed var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}>
                          Делегирование претензии сотруднику
                        </Typography.Body>
                        <Flex gap="0.45rem" wrap="wrap" style={{ marginBottom: "0.45rem" }}>
                          <select
                            className="admin-form-input"
                            value={adminDelegateLogin}
                            onChange={(e) => setAdminDelegateLogin(e.target.value)}
                            style={{ minWidth: 240, padding: "0.4rem 0.5rem" }}
                          >
                            <option value="">Выберите сотрудника</option>
                            {employeeDirectoryItems
                              .filter((emp) => !!String(emp?.login || "").trim())
                              .map((emp) => (
                                <option key={`delegate-employee-${emp.id}`} value={String(emp.login || "").trim().toLowerCase()}>
                                  {String(emp.full_name || emp.login || "").trim()}{emp.position ? ` — ${emp.position}` : ""}{emp.login ? ` (${emp.login})` : ""}
                                </option>
                              ))}
                          </select>
                        </Flex>
                        <textarea
                          className="admin-form-input"
                          rows={2}
                          placeholder="Комментарий к делегированию"
                          value={adminDelegateComment}
                          onChange={(e) => setAdminDelegateComment(e.target.value)}
                          style={{ width: "100%" }}
                        />
                        <Flex justify="flex-end" style={{ marginTop: "0.35rem" }}>
                          <Button
                            type="button"
                            className="filter-button"
                            onClick={() => updateAdminClaimStatus(
                              adminClaimDetail.claim.id,
                              "in_progress",
                              Number(adminClaimApprovedAmountDraft || 0),
                              {
                                expertLogin: adminDelegateLogin.trim(),
                                managerNote: adminClaimNoteDraft.trim(),
                                internalComment: `Делегировано сотруднику ${adminDelegateLogin.trim() || "—"}${adminDelegateComment.trim() ? `: ${adminDelegateComment.trim()}` : ""}`.trim(),
                              }
                            )}
                            disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id || !adminDelegateLogin.trim()}
                          >
                            Подключить
                          </Button>
                        </Flex>
                      </div>
                    )}
                    {adminRequestDocsOpen && (
                      <div style={{ marginTop: "0.55rem", border: "1px dashed var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}>
                          Какие документы запросить у клиента
                        </Typography.Body>
                        <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.45rem" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.82rem" }}>
                            <input type="checkbox" checked={adminRequestDocUPD} onChange={(e) => setAdminRequestDocUPD(e.target.checked)} />
                            УПД
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.82rem" }}>
                            <input type="checkbox" checked={adminRequestDocTTN} onChange={(e) => setAdminRequestDocTTN(e.target.checked)} />
                            ТТН
                          </label>
                        </Flex>
                        <textarea
                          className="admin-form-input"
                          rows={2}
                          placeholder="Какие документы нужны дополнительно"
                          value={adminRequestDocsComment}
                          onChange={(e) => setAdminRequestDocsComment(e.target.value)}
                          style={{ width: "100%" }}
                        />
                        <Flex justify="flex-end" style={{ marginTop: "0.35rem" }}>
                          <Button
                            type="button"
                            className="filter-button"
                            onClick={() => {
                              const docs = [adminRequestDocUPD ? "УПД" : "", adminRequestDocTTN ? "ТТН" : ""].filter(Boolean);
                              const text = docs.length > 0 ? `Запрошены документы: ${docs.join(", ")}` : "Запрошены дополнительные документы";
                              const details = adminRequestDocsComment.trim() ? `${text}. ${adminRequestDocsComment.trim()}` : text;
                              updateAdminClaimStatus(
                                adminClaimDetail.claim.id,
                                "waiting_docs",
                                Number(adminClaimApprovedAmountDraft || 0),
                                {
                                  managerNote: [adminClaimNoteDraft.trim(), details].filter(Boolean).join("\n"),
                                  internalComment: details,
                                }
                              );
                            }}
                            disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                          >
                            Отправить запрос
                          </Button>
                        </Flex>
                      </div>
                    )}
                  </div>
                  {Array.isArray(adminClaimDetail.photos) && adminClaimDetail.photos.length > 0 && (
                    <div style={{ marginTop: "0.45rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Фото</Typography.Body>
                      <Flex gap="0.45rem" wrap="wrap">
                        {adminClaimDetail.photos.slice(0, 12).map((p: any) => {
                          const mime = String(p?.mimeType || "image/jpeg");
                          const src = p?.base64 ? `data:${mime};base64,${p.base64}` : "";
                          const fileName = String(p?.fileName || p?.caption || `photo-${p?.id || "file"}.jpg`);
                          return (
                            <div key={p.id} style={{ display: "grid", gap: "0.25rem", width: 96 }}>
                              <a href={src || "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                                <img
                                  src={src}
                                  alt={String(p?.caption || p?.fileName || "Фото")}
                                  style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}
                                />
                              </a>
                              <Flex gap="0.2rem" wrap="wrap">
                                <a href={src || "#"} target="_blank" rel="noreferrer" style={{ fontSize: "0.68rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Открыть</a>
                                <a href={src || "#"} download={fileName} style={{ fontSize: "0.68rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Скачать</a>
                              </Flex>
                            </div>
                          );
                        })}
                      </Flex>
                    </div>
                  )}
                  {Array.isArray(adminClaimDetail.documents) && adminClaimDetail.documents.length > 0 && (
                    <div style={{ marginTop: "0.55rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>PDF</Typography.Body>
                      <Flex gap="0.35rem" wrap="wrap">
                        {adminClaimDetail.documents.map((d: any) => {
                          const mime = String(d?.mimeType || "application/pdf");
                          const href = d?.base64 ? `data:${mime};base64,${d.base64}` : "#";
                          return (
                            <Flex key={d.id} gap="0.3rem" align="center" wrap="wrap" style={{ border: "1px solid var(--color-border)", borderRadius: 999, padding: "0.14rem 0.45rem", background: "var(--color-bg-hover)" }}>
                              <Typography.Body style={{ fontSize: "0.74rem" }}>{String(d?.fileName || "Документ")}</Typography.Body>
                              <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Открыть</a>
                              <a href={href} download={String(d?.fileName || "document.pdf")} style={{ fontSize: "0.7rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Скачать</a>
                            </Flex>
                          );
                        })}
                      </Flex>
                    </div>
                  )}
                  {Array.isArray(adminClaimDetail.videoLinks) && adminClaimDetail.videoLinks.length > 0 && (
                    <div style={{ marginTop: "0.55rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Видео-ссылки</Typography.Body>
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        {adminClaimDetail.videoLinks.map((v: any) => (
                          <Flex key={v.id} gap="0.35rem" align="center" wrap="wrap">
                            <Typography.Body style={{ fontSize: "0.78rem" }}>{String(v?.title || "Видео")}</Typography.Body>
                            <a href={String(v?.url || "#")} target="_blank" rel="noreferrer" style={{ fontSize: "0.78rem", color: "var(--color-primary-blue)" }}>
                              Открыть
                            </a>
                          </Flex>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: "0.6rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.3rem" }}>
                      Документы по перевозке
                    </Typography.Body>
                    <Flex gap="0.4rem" wrap="wrap">
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={adminClaimDocDownloading !== ""}
                        onClick={() => downloadClaimCargoDoc("АПП")}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {adminClaimDocDownloading === "АПП" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Скачать АПП
                      </Button>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={adminClaimDocDownloading !== ""}
                        onClick={() => downloadClaimCargoDoc("ЭР")}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {adminClaimDocDownloading === "ЭР" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Скачать ЭР
                      </Button>
                    </Flex>
                    {adminClaimDocError ? (
                      <Typography.Body style={{ fontSize: "0.74rem", color: "#ef4444", marginTop: "0.3rem" }}>
                        {adminClaimDocError}
                      </Typography.Body>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Решение</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
                    Максимальная сумма ущерба: {adminClaimMaxDamageLoading
                      ? "расчет..."
                      : adminClaimMaxDamageAmount == null
                        ? "— рублей"
                        : `${Number(adminClaimMaxDamageAmount).toLocaleString("ru-RU")} рублей`}
                  </Typography.Body>
                  <Flex gap="0.45rem" wrap="wrap" align="center">
                    <Input
                      type="number"
                      className="admin-form-input"
                      placeholder="Одобренная сумма"
                      value={adminClaimApprovedAmountDraft}
                      onChange={(e) => setAdminClaimApprovedAmountDraft(e.target.value)}
                      style={{ maxWidth: 220, height: 44, boxSizing: "border-box" }}
                    />
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#10b981", color: "white", height: 44, minWidth: 220 }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "approved",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Утвердить решение
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#ef4444", color: "white", height: 44, minWidth: 160 }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "rejected",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Отказать
                    </Button>
                  </Flex>
                </div>

                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Резолюция руководителя</Typography.Body>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    placeholder="Комментарий руководителя"
                    value={adminLeaderCommentDraft}
                    onChange={(e) => setAdminLeaderCommentDraft(e.target.value)}
                    style={{ width: "100%", marginBottom: "0.45rem" }}
                  />
                  <Flex gap="0.45rem" wrap="wrap" align="center">
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#10b981", color: "white" }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "approved",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Утвердить решение менеджера
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#f59e0b", color: "white" }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "in_progress",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { leaderComment: `Отменено руководителем: ${adminLeaderCommentDraft.trim()}`.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Отменить решение менеджера
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "waiting_docs",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { leaderComment: `На доработку: ${adminLeaderCommentDraft.trim()}`.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Отправить на доработку
                    </Button>
                  </Flex>
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Хронология</Typography.Body>
                  {Array.isArray(adminClaimDetail.events) && adminClaimDetail.events.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.3rem" }}>
                      {adminClaimDetail.events.slice(-20).reverse().map((ev: any) => (
                        <Typography.Body key={ev.id} style={{ fontSize: "0.8rem" }}>
                          {new Date(ev.createdAt).toLocaleString("ru-RU")} — {ev.eventType} {ev.toStatus ? `→ ${ev.toStatus}` : ""}
                        </Typography.Body>
                      ))}
                    </div>
                  ) : (
                    <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Событий пока нет</Typography.Body>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
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

      {tab === "pnl" && isSuperAdmin && (
        <PnlSection
          initialView={pnlExpensePrefill ? "ref-expenses" : "dashboard"}
          expenseCategoryPrefill={pnlExpensePrefill}
        />
      )}
    </div>
  );
}
