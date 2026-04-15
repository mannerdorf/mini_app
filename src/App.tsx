import React, { FormEvent, useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, Suspense, lazy } from "react";
import {
    LogOut, Truck, Loader2, Check, X, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Users, Scale, RussianRuble, List, Download, Maximize, Minimize2,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, TrendingDown, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart, Building2, Bell, Shield, Settings, Info, ArrowLeft, Plus, Trash2, MapPin, Phone, Mail, Share2, Mic, Square, Ship, RefreshCw, Lock, Moon, Sun
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import { ChatModal } from "./ChatModal";
import "./styles.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
    ensureOk,
    readJsonOrText,
    extractErrorMessage,
    extractCustomerFromPerevozki,
    extractInnFromPerevozki,
    getExistingInns,
    dedupeCustomersByInn,
    dedupeCompaniesByName,
} from "./utils";
import { TabBar } from "./components/TabBar";
import { AccountSwitcher } from "./components/AccountSwitcher";
import { CustomerSwitcher } from "./components/CustomerSwitcher";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppMainContent } from "./components/AppMainContent";
import { getWebApp, isMaxWebApp, isMaxDocsEnabled } from "./webApp";
import { DOCUMENT_METHODS } from "./documentMethods";
import { NotificationsPage } from "./pages/NotificationsPage";
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
import { TinyUrlTestPage } from "./pages/TinyUrlTestPage";
import { AiChatProfilePage } from "./pages/AiChatProfilePage";
import { TapSwitch } from "./components/TapSwitch";
import { FilterDropdownPortal } from "./components/ui/FilterDropdownPortal";
import { DateText } from "./components/ui/DateText";
import { DetailItem } from "./components/ui/DetailItem";
import { FilterDialog } from "./components/shared/FilterDialog";
import { StatusBadge, StatusBillBadge } from "./components/shared/StatusBadges";
import { normalizeStatus, getFilterKeyByStatus, getPaymentFilterKey, getSumColorByPaymentStatus, isReceivedInfoStatus, BILL_STATUS_MAP, STATUS_MAP } from "./lib/statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./lib/slaWorkSchedule";
import type { BillStatusFilterKey } from "./lib/statusUtils";
import { CustomPeriodModal } from "./components/modals/CustomPeriodModal";
import { CargoDetailsModal } from "./components/modals/CargoDetailsModal";
import { LegalModal } from "./components/modals/LegalModal";
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then(m => ({ default: m.DocumentsPage })));
import { AdminPage } from "./pages/AdminPage";
import { CMSStandalonePage } from "./pages/CMSStandalonePage";
import { NotFoundPage, shouldShowNotFound } from "./pages/NotFoundPage";
import { AboutCompanyPage } from "./pages/AboutCompanyPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { AddCompanyByINNPage } from "./pages/AddCompanyByINNPage";
import { AddCompanyByLoginPage } from "./pages/AddCompanyByLoginPage";
import { CompaniesListPage } from "./pages/CompaniesListPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { CargoPage } from "./pages/CargoPage";
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
import { ExpenseRequestsPage } from "./pages/ExpenseRequestsPage";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { getInitialAuthState } from "./lib/authState";
import {
    WB_TAB,
    isWbOnlyAccount,
    isWildberriesTab,
    wildberriesInitialTabFromUrl,
    syncAppUrlWithActiveTab,
    WbOnlyAppLayout,
    useResetGlobalSearchOnWildberries,
    TABS_ALLOWED_ON_RESTORE,
} from "./wb/appWb";
import { PUBLIC_OFFER_TEXT, PERSONAL_DATA_CONSENT_TEXT } from "./constants/legalTexts";
import { getSlaInfo, getPlanDays, getInnFromCargo, isFerry } from "./lib/cargoUtils";
import * as dateUtils from "./lib/dateUtils";
import { formatCurrency, stripOoo, formatInvoiceNumber, cityToCode, transliterateFilename, normalizeInvoiceStatus, parseCargoNumbersFromText } from "./lib/formatUtils";
import { PROXY_API_BASE_URL, PROXY_API_GETCUSTOMERS_URL, PROXY_API_DOWNLOAD_URL, PROXY_API_SEND_DOC_URL, PROXY_API_GETPEREVOZKA_URL, PROXY_API_INVOICES_URL } from "./constants/config";
import { usePerevozki, usePerevozkiMulti, usePerevozkiMultiAccounts, usePrevPeriodPerevozki, useInvoices } from "./hooks/useApi";
import type {
    Account, AccountPermissions, ApiError, AuthData, CargoItem, CompanyRow, CustomerOption,
    PerevozkiRole, ProfileView, StatusFilter, Tab,
} from "./types";

const { getDateRange } = dateUtils;
type AuthMethodsConfig = {
    api_v1: boolean;
    api_v2: boolean;
    cms: boolean;
};

const resolveChecked = (value: unknown): boolean => {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
        const target = (value as { target?: { checked?: boolean } }).target;
        if (typeof target?.checked === "boolean") return target.checked;
    }
    return false;
};

const toBooleanPermission = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
        return undefined;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
        if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
    }
    return undefined;
};

const normalizePermissions = (raw: unknown): AccountPermissions | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const boolValue = toBooleanPermission(value);
        if (boolValue !== undefined) out[key] = boolValue;
    }
    return out as AccountPermissions;
};

const getFileNameFromDisposition = (header: string | null, fallback: string) => {
    if (!header) return fallback;
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const quotedMatch = header.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = header.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return fallback;
};

// ================== COMPONENTS ==================

export default function App() {
    type AppTheme = "light" | "dark";
    const [theme, setTheme] = useState<AppTheme>(() => {
        if (typeof window === "undefined") return "light";
        try {
            return window.localStorage.getItem("haulz.theme") === "dark" ? "dark" : "light";
        } catch {
            return "light";
        }
    });
    const [desktopExpanded, setDesktopExpanded] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem("haulz.desktop.expanded") === "true";
    });

    // --- Telegram Init ---
    useEffect(() => {
        let mounted = true;
        let cleanupHandler: (() => void) | undefined;
        let attempts = 0;

        const initWebApp = () => {
            const webApp = getWebApp();
            if (!webApp || !mounted) return false;

            try {
                if (typeof webApp.ready === "function") {
                    webApp.ready();
                }
                
                // Настройка цветов для MAX Bridge
                if (isMaxWebApp()) {
                    // Устанавливаем цвет фона - всегда белый для MAX
                    if (typeof webApp.setBackgroundColor === "function") {
                        webApp.setBackgroundColor('#ffffff');
                    }
                    
                    // Устанавливаем цвет хедера (визуально привязываем к бренду)
                    if (typeof webApp.setHeaderColor === "function") {
                        webApp.setHeaderColor('#2563eb'); // Синий цвет бренда HAULZ
                    }
                }
                
                if (typeof webApp.expand === "function") {
                    webApp.expand();
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                const scheme = String((webApp as any)?.colorScheme || "").toLowerCase();
                if (scheme === "dark" || scheme === "light") setTheme(scheme as AppTheme);
            };

            if (typeof webApp.onEvent === "function") {
                webApp.onEvent("themeChanged", themeHandler);
                cleanupHandler = () => webApp.offEvent?.("themeChanged", themeHandler);
            }

            return true;
        };

        // На Android WebApp может появиться позже, поэтому немного подождём
        if (!initWebApp()) {
            const timer = setInterval(() => {
                attempts += 1;
                const ready = initWebApp();
                if (ready || attempts > 40) {
                    clearInterval(timer);
                }
            }, 100);

            return () => {
                mounted = false;
                clearInterval(timer);
                cleanupHandler?.();
            };
        }

        return () => {
            mounted = false;
            cleanupHandler?.();
        };
    }, []);

    // Множественные аккаунты (синхронное восстановление из localStorage — избегаем пустой страницы при первом входе)
    const [accounts, setAccounts] = useState<Account[]>(() => getInitialAuthState().accounts);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(() => getInitialAuthState().activeAccountId);
    /** Выбранные компании для отображения перевозок (можно несколько) */
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => getInitialAuthState().selectedAccountIds);
    const [useServiceRequest, setUseServiceRequest] = useState(false);
    const [serviceRefreshSpinning, setServiceRefreshSpinning] = useState(false);
    // Вычисляем текущий активный аккаунт
    const auth = useMemo(() => {
        if (!activeAccountId) return null;
        const account = accounts.find(acc => acc.id === activeAccountId);
        if (!account || typeof account.login !== "string" || typeof account.password !== "string") return null;
        const inn = account.activeCustomerInn ?? account.customers?.[0]?.inn ?? "";
        const forceInn = !!account.isRegisteredUser && !account.accessAllInns && !!inn;
        return {
            login: account.login,
            password: account.password,
            ...((forceInn || account.activeCustomerInn || inn) ? { inn: inn || account.activeCustomerInn || undefined } : {}),
            ...(account.isRegisteredUser ? { isRegisteredUser: true } : {}),
        };
    }, [accounts, activeAccountId]);
    const activeAccount = useMemo(() => {
        if (!activeAccountId) return null;
        return accounts.find(acc => acc.id === activeAccountId) || null;
    }, [accounts, activeAccountId]);

    /** Аккаунты для отображения перевозок (один или несколько). У сотрудников без доступа ко всем заказчикам всегда передаём ИНН — фильтрация по компании. */
    const selectedAuths = useMemo((): AuthData[] => {
        const ids = selectedAccountIds.length > 0
            ? selectedAccountIds
            : (activeAccountId && accounts.some((a) => a.id === activeAccountId) ? [activeAccountId] : []);
        return ids
            .map((id) => accounts.find((acc) => acc.id === id))
            .filter((acc): acc is Account => !!acc)
            .map((acc) => {
                const inn = acc.activeCustomerInn ?? acc.customers?.[0]?.inn ?? "";
                return {
                    login: acc.login,
                    password: acc.password,
                    ...(inn || acc.activeCustomerInn ? { inn: inn || acc.activeCustomerInn || undefined } : {}),
                    ...(acc.isRegisteredUser ? { isRegisteredUser: true } : {}),
                };
            });
    }, [accounts, selectedAccountIds, activeAccountId]);

    // Если выбранных компаний нет, но есть активный аккаунт — подставляем его
    useEffect(() => {
        if (accounts.length > 0 && selectedAccountIds.length === 0 && activeAccountId && accounts.some((a) => a.id === activeAccountId)) {
            setSelectedAccountIds([activeAccountId]);
        }
    }, [accounts.length, activeAccountId, selectedAccountIds.length]);

    // Режим сквозной выборки без жёсткой привязки к ИНН:
    // переключатель доступен только тем, у кого в админке включён «Служебный режим» (service_mode).
    const serviceModeUnlocked = useMemo(() => {
        return !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;
    }, [activeAccount?.isRegisteredUser, activeAccount?.permissions?.service_mode]);
    const isWbOnlyUser = useMemo(() => isWbOnlyAccount(activeAccount), [activeAccount]);
    useEffect(() => {
        if (!serviceModeUnlocked && useServiceRequest) {
            setUseServiceRequest(false);
        }
    }, [serviceModeUnlocked, useServiceRequest]);
    const [authMethods, setAuthMethods] = useState<AuthMethodsConfig>({
        api_v1: true,
        api_v2: true,
        cms: true,
    });
    useEffect(() => {
        let cancelled = false;
        const loadConfig = async () => {
            try {
                const res = await fetch("/api/auth-config");
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data?.error || "Ошибка загрузки способов авторизации");
                if (cancelled) return;
                const config = data?.config || {};
                setAuthMethods({
                    api_v1: config.api_v1 ?? true,
                    api_v2: config.api_v2 ?? true,
                    cms: config.cms ?? true,
                });
            } catch (err) {
                if (!cancelled) {
                    console.warn("Failed to load auth config", err);
                }
            }
        };
        loadConfig();
        return () => {
            cancelled = true;
        };
    }, []);
    const persistTwoFactorSettings = useCallback(async (account: Account, patch: Partial<Account>) => {
        const login = account.login;
        if (!login) return;
        const enabled = patch.twoFactorEnabled ?? account.twoFactorEnabled ?? false;
        const method = patch.twoFactorMethod ?? account.twoFactorMethod ?? "google";
        const telegramLinked = patch.twoFactorTelegramLinked ?? account.twoFactorTelegramLinked ?? false;
        try {
            await fetch("/api/2fa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, enabled, method, telegramLinked })
            });
        } catch {
            // silent: server storage is best-effort
        }
    }, []);

    useEffect(() => {
        if (!activeAccount?.login) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
                if (!res.ok) return;
                const data = await res.json();
                const settings = data?.settings;
                if (!settings || cancelled) return;
                setAccounts(prev =>
                    prev.map(acc =>
                                acc.id === activeAccount.id
                            ? {
                                ...acc,
                                twoFactorEnabled: !!settings.enabled,
                                twoFactorMethod: settings.method === "telegram" ? "telegram" : "google",
                                twoFactorTelegramLinked: !!settings.telegramLinked,
                                twoFactorGoogleSecretSet: !!settings.googleSecretSet
                            }
                            : acc
                    )
                );
            } catch {
                // ignore load errors
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [activeAccount?.id, activeAccount?.login]);
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (typeof window === "undefined") return "cargo";
        const wbTab = wildberriesInitialTabFromUrl();
        if (wbTab) return wbTab;
        try {
            const url = new URL(window.location.href);
            const t = (url.searchParams.get("tab") || "").toLowerCase();
            if (t === "profile") return "profile";
            if (t === "cargo") return "cargo";
            if (t === "home" || t === "dashboard") return "dashboard";
            if (t === "docs") return "docs";
            if (t === "expense_requests") return "expense_requests";
        } catch {
            // ignore
        }
        // Первый запуск: "Грузы"
        return "cargo";
    });
    const [showDashboard, setShowDashboard] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinCode, setPinCode] = useState('');
    const [pinError, setPinError] = useState(false);
    const hasRestoredTabRef = React.useRef(false);
    const hasUrlTabOverrideRef = React.useRef(false);
    const registeredLoginRefreshInFlightRef = useRef(false);
    const syncedRegisteredAccountsRef = useRef<Set<string>>(new Set());

    const updateActiveAccountCustomer = useCallback((customer: string) => {
        if (!activeAccountId || !customer) return;
        setAccounts(prev => {
            const current = prev.find(acc => acc.id === activeAccountId);
            if (!current || current.customer === customer) {
                return prev;
            }
            return prev.map(acc =>
                acc.id === activeAccountId ? { ...acc, customer } : acc
            );
        });
    }, [activeAccountId]);
    
    const openSecretPinModal = () => {
        setShowPinModal(true);
        setPinCode('');
        setPinError(false);
    };
    
    // Проверка пин-кода (для входа и выхода)
    const handlePinSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (pinCode === '1984') {
            // Переключаем состояние секретного режима
            if (showDashboard) {
                // Выход из секретного режима
                setShowDashboard(false);
                setActiveTab("cargo");
            } else {
                // Вход в секретный режим
                setShowDashboard(true);
                setActiveTab("dashboard");
            }
            setShowPinModal(false);
            setPinCode('');
            setPinError(false);
        } else {
            setPinError(true);
            setPinCode('');
        }
    }; 
    const [startParam, setStartParam] = useState<string | null>(null);
    const [contextCargoNumber, setContextCargoNumber] = useState<string | null>(null);
    const [overlayCargoNumber, setOverlayCargoNumber] = useState<string | null>(null);
    const [overlayCargoItem, setOverlayCargoItem] = useState<CargoItem | null>(null);
    const [overlayCargoLoading, setOverlayCargoLoading] = useState(false);
    const [overlayFavVersion, setOverlayFavVersion] = useState(0);
    
    // ИНИЦИАЛИЗАЦИЯ ПУСТЫМИ СТРОКАМИ (данные берутся с фронта)
    const [login, setLogin] = useState(""); 
    const [password, setPassword] = useState(""); 
    
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 
    const [twoFactorPending, setTwoFactorPending] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [showForgotPage, setShowForgotPage] = useState(() => {
        try {
            if (typeof window === "undefined") return false;
            return new URL(window.location.href).searchParams.get("forgot") === "1";
        } catch {
            return false;
        }
    });
    const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
    const [twoFactorLoading, setTwoFactorLoading] = useState(false);
    const [pendingLogin, setPendingLogin] = useState<{ login: string; loginKey: string; password: string; customer?: string | null; customers?: CustomerOption[]; perevozkiInn?: string } | null>(null);
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [debugMenuOpen, setDebugMenuOpen] = useState(false);
    const debugMenuRef = useRef<HTMLDivElement>(null);
    const [searchText, setSearchText] = useState(() => {
        if (typeof window === "undefined") return "";
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("tab") === "docs") {
                const section = url.searchParams.get("section")?.trim();
                if (section) {
                    try {
                        window.localStorage.setItem("haulz.docs.section", section);
                    } catch { /* ignore */ }
                }
                const s = url.searchParams.get("search")?.trim();
                if (s) return s;
            }
        } catch { /* ignore */ }
        return "";
    });
    const [isOfferOpen, setIsOfferOpen] = useState(false);
    const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    useEffect(() => {
        if (!activeAccount?.isRegisteredUser || !activeAccount?.permissions) return;
        const perms = activeAccount.permissions;
        if (isWbOnlyUser) {
            if (!isWildberriesTab(activeTab)) setActiveTab(WB_TAB);
            return;
        }
        const canHome = true;
        const canCargo = true;
        const canDocs = !!(
            perms.doc_invoices ||
            perms.doc_acts ||
            perms.doc_orders ||
            perms.doc_sendings ||
            perms.doc_claims ||
            perms.doc_contracts ||
            perms.doc_acts_settlement ||
            perms.doc_tariffs
        );
        const canExpenseRequests = !!(perms.supervisor && perms.haulz);
        const isAllowed =
            activeTab === "profile" ? true :
            activeTab === "cargo" ? canCargo :
            activeTab === "docs" ? canDocs :
            activeTab === "expense_requests" ? canExpenseRequests :
            activeTab === "dashboard" || activeTab === "home" ? canHome :
            true;
        if (isAllowed) return;
        const fallback: Tab = canHome ? "dashboard" : canDocs ? "docs" : canCargo ? "cargo" : canExpenseRequests ? "expense_requests" : "profile";
        if (fallback !== activeTab) setActiveTab(fallback);
    }, [activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.permissions, activeTab, isWbOnlyUser]);

    useEffect(() => {
        document.body.className = `${theme}-mode`;
        try {
            window.localStorage.setItem("haulz.theme", theme);
        } catch {
            // ignore
        }
        if (isMaxWebApp()) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.setBackgroundColor === "function") {
                webApp.setBackgroundColor(theme === "dark" ? "#000000" : "#ffffff");
            }
        }
    }, [theme]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem("haulz.desktop.expanded", String(desktopExpanded));
        } catch {
            // ignore
        }
    }, [desktopExpanded]);

    useResetGlobalSearchOnWildberries(activeTab, setIsSearchExpanded, setSearchText);

    useEffect(() => {
        if (!debugMenuOpen) return;
        const onOutside = (e: MouseEvent) => {
            if (debugMenuRef.current && !debugMenuRef.current.contains(e.target as Node)) setDebugMenuOpen(false);
        };
        document.addEventListener("click", onOutside);
        return () => document.removeEventListener("click", onOutside);
    }, [debugMenuOpen]);

    // Обработка start_param для контекстного запуска
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        const webApp = getWebApp();
        if (!webApp) return;
        
        // Получаем start_param из WebApp (MAX/Telegram)
        const param = (webApp as any).startParam || 
                     (webApp as any).initDataUnsafe?.start_param ||
                     new URLSearchParams(window.location.search).get('start_param') ||
                     new URLSearchParams(window.location.search).get('startapp');
        
        if (param) {
            setStartParam(param);
            console.log('📱 Start param:', param);
            
            // Парсим параметры: invoice_123, upd_456, delivery_789
            if (param.startsWith('invoice_')) {
                const number = param.replace('invoice_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('upd_')) {
                const number = param.replace('upd_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('delivery_')) {
                const number = param.replace('delivery_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('haulz_n_')) {
                // Обработка нашего нового формата: haulz_n_[номер](_c_[chatId])
                const parts = param.split('_');
                const number = parts[2]; // haulz(0)_n(1)_NUMBER(2)
                if (number) {
                    setContextCargoNumber(number);
                    setActiveTab('cargo');
                }
            }
        }
    }, []);

    // Загрузка аккаунтов из localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            // Если tab задан в URL — не перетираем восстановлением из localStorage
            try {
                const url = new URL(window.location.href);
                const t = (url.searchParams.get("tab") || "").toLowerCase();
                if (t) hasUrlTabOverrideRef.current = true;
            } catch {
                // ignore
            }

            // Загружаем массив аккаунтов (новый формат) — приоритет над haulz.auth
            const savedAccounts = window.localStorage.getItem("haulz.accounts");
            const savedActiveId = window.localStorage.getItem("haulz.activeAccountId");
            const savedTab = window.localStorage.getItem("haulz.lastTab");
            if (savedAccounts) {
                try {
                    let parsedAccounts = JSON.parse(savedAccounts) as Account[];
                    if (Array.isArray(parsedAccounts) && parsedAccounts.length > 0) {
                        // При загрузке: подставить customer по первому заказчику; не доверять inCustomerDirectory из кэша — подтянем с бэкенда
                        parsedAccounts = parsedAccounts.map((acc) => {
                            const withCustomer = acc.customers?.length && !acc.customer ? { ...acc, customer: acc.customers[0].name } : acc;
                            const normalizedPerms = normalizePermissions(withCustomer.permissions);
                            return {
                                ...withCustomer,
                                ...(normalizedPerms ? { permissions: normalizedPerms } : {}),
                                inCustomerDirectory: undefined as boolean | undefined,
                            };
                        });
                        setAccounts(parsedAccounts);
                        if (savedActiveId && parsedAccounts.find(acc => acc.id === savedActiveId)) {
                            setActiveAccountId(savedActiveId);
                        } else {
                            setActiveAccountId(parsedAccounts[0].id);
                        }
                        const savedSelectedIds = window.localStorage.getItem("haulz.selectedAccountIds");
                        let didSetSelected = false;
                        if (savedSelectedIds) {
                            try {
                                const ids = JSON.parse(savedSelectedIds) as string[];
                                if (Array.isArray(ids) && ids.length > 0) {
                                    const valid = ids.filter((id) => parsedAccounts.some((acc) => acc.id === id));
                                    if (valid.length > 0) {
                                        setSelectedAccountIds(valid);
                                        didSetSelected = true;
                                    }
                                }
                            } catch {
                                // ignore
                            }
                        }
                        if (!didSetSelected) {
                            const firstId = (savedActiveId && parsedAccounts.find(acc => acc.id === savedActiveId) ? savedActiveId : parsedAccounts[0].id) ?? null;
                            setSelectedAccountIds(firstId ? [firstId] : []);
                        }
                        // Восстанавливаем последнюю вкладку (без сохранения секретного режима)
                        if (savedTab && !hasUrlTabOverrideRef.current) {
                            const t = savedTab as Tab;
                            if (TABS_ALLOWED_ON_RESTORE.includes(t)) {
                                if (t === "docs") {
                                    setActiveTab("docs");
                                } else if (t === "home") {
                                    setActiveTab("dashboard");
                                } else {
                                    setActiveTab(t);
                                }
                            }
                        }
                        hasRestoredTabRef.current = true;
                    }
                } catch {
                    // Игнорируем ошибки парсинга
                }
            }
            // Если нет сохранённых аккаунтов — миграция со старого формата haulz.auth
            if (!savedAccounts) {
                const saved = window.localStorage.getItem("haulz.auth");
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved) as AuthData;
                        if (parsed?.login && parsed?.password) {
                            const accountId = parsed.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            const account: Account = { login: parsed.login, password: parsed.password, id: accountId };
                            setAccounts([account]);
                            setActiveAccountId(accountId);
                            setSelectedAccountIds([accountId]);
                        }
                    } catch {
                        // ignore
                    }
                }
            }
        } catch {
            // игнорируем ошибки чтения
        }
    }, []);

    // Сохраняем последнюю вкладку, чтобы при следующем запуске открыть на ней
    useEffect(() => {
        if (!hasRestoredTabRef.current) return;
        try {
            window.localStorage.setItem("haulz.lastTab", activeTab);
        } catch {
            // игнорируем ошибки записи
        }
    }, [activeTab]);

    // Синхронизируем URL. Не трогаем ?tab=cms — это админка.
    useEffect(() => {
        syncAppUrlWithActiveTab(activeTab);
    }, [activeTab]);
    
    // Сохранение аккаунтов и выбранных компаний в localStorage
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        try {
            window.localStorage.setItem("haulz.accounts", JSON.stringify(accounts));
            if (activeAccountId) {
                window.localStorage.setItem("haulz.activeAccountId", activeAccountId);
            }
            if (selectedAccountIds.length > 0) {
                window.localStorage.setItem("haulz.selectedAccountIds", JSON.stringify(selectedAccountIds));
            }
        } catch {
            // игнорируем ошибки записи
        }
    }, [accounts, activeAccountId, selectedAccountIds]);

    // Подтянуть данные зарегистрированного пользователя с бэкенда (в т.ч. inCustomerDirectory из справочника заказчиков в БД)
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        const needRefresh = accounts.filter(
            (acc) =>
                acc.isRegisteredUser &&
                acc.password &&
                (!acc.customers?.length || !acc.activeCustomerInn || acc.inCustomerDirectory === undefined)
        );
        if (needRefresh.length === 0) return;
        if (registeredLoginRefreshInFlightRef.current) return; // избегаем лавины запросов при повторных срабатываниях эффекта
        registeredLoginRefreshInFlightRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                const updates: { id: string; customers: CustomerOption[]; activeCustomerInn: string | null; customer: string | null; accessAllInns: boolean; inCustomerDirectory?: boolean; permissions?: Record<string, boolean>; financialAccess?: boolean }[] = [];
                for (const acc of needRefresh) {
                    try {
                        const res = await fetch("/api/auth-registered-login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: acc.login.trim().toLowerCase(), password: acc.password }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (cancelled || !res.ok || !data?.ok || !data?.user) continue;
                    const u = data.user;
                    const customers: CustomerOption[] = u.inn ? [{ name: u.companyName || u.inn, inn: u.inn }] : [];
                    updates.push({
                        id: acc.id,
                        customers,
                        activeCustomerInn: u.inn ?? null,
                        customer: u.companyName ?? null,
                        accessAllInns: !!u.accessAllInns,
                        inCustomerDirectory: !!u.inCustomerDirectory,
                        permissions: normalizePermissions(u.permissions),
                        financialAccess: u.financialAccess,
                    });
                } catch {
                    // ignore
                }
            }
                if (cancelled || updates.length === 0) return;
                setAccounts((prev) =>
                    prev.map((a) => {
                        const up = updates.find((u) => u.id === a.id);
                        if (!up) return a;
                        const hadCustomers = (a.customers?.length ?? 0) > 0;
                        return {
                            ...a,
                            customers: hadCustomers ? (a.customers ?? up.customers) : up.customers,
                            // Не перезаписывать activeCustomerInn, если пользователь уже выбрал компанию в шапке (CustomerSwitcher)
                            activeCustomerInn: a.activeCustomerInn ?? up.activeCustomerInn ?? undefined,
                            customer: hadCustomers ? (a.customer ?? up.customer ?? undefined) : (up.customer ?? undefined),
                            accessAllInns: up.accessAllInns,
                            inCustomerDirectory: up.inCustomerDirectory,
                            ...(up.permissions != null ? { permissions: up.permissions } : {}),
                            ...(up.financialAccess != null ? { financialAccess: up.financialAccess } : {}),
                        };
                    })
                );
            } finally {
                registeredLoginRefreshInFlightRef.current = false;
            }
        })();
        return () => { cancelled = true; };
    }, [accounts]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!activeAccount?.id || !activeAccount?.isRegisteredUser || !activeAccount?.login || !activeAccount?.password) return;
        if (syncedRegisteredAccountsRef.current.has(activeAccount.id)) return;
        syncedRegisteredAccountsRef.current.add(activeAccount.id);
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/auth-registered-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: activeAccount.login.trim().toLowerCase(), password: activeAccount.password }),
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled || !res.ok || !data?.ok || !data?.user) return;
                const user = data.user;
                const customers: CustomerOption[] = user.inn ? [{ name: user.companyName || user.inn, inn: user.inn }] : [];
                setAccounts((prev) =>
                    prev.map((acc) =>
                        acc.id !== activeAccount.id
                            ? acc
                            : {
                                ...acc,
                                customers: (acc.customers && acc.customers.length > 0) ? acc.customers : customers,
                                activeCustomerInn: acc.activeCustomerInn ?? user.inn ?? undefined,
                                customer: acc.customer ?? user.companyName ?? undefined,
                                accessAllInns: !!user.accessAllInns,
                                inCustomerDirectory: !!user.inCustomerDirectory,
                                ...(normalizePermissions(user.permissions) ? { permissions: normalizePermissions(user.permissions) } : {}),
                                ...(user.financialAccess != null ? { financialAccess: user.financialAccess } : {}),
                            }
                    )
                );
            } catch {
                // ignore best-effort refresh errors
            }
        })();
        return () => { cancelled = true; };
    }, [activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password]);

    // Обновить права при открытии вкладки «Профиль», чтобы подтянуть изменения из админки (в т.ч. раздел Претензии)
    const profileRefreshInFlightRef = useRef(false);
    useEffect(() => {
        if (activeTab !== "profile") return;
        if (!activeAccount?.id || !activeAccount?.isRegisteredUser || !activeAccount?.login || !activeAccount?.password) return;
        if (profileRefreshInFlightRef.current) return;
        profileRefreshInFlightRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/auth-registered-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: activeAccount.login.trim().toLowerCase(), password: activeAccount.password }),
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled || !res.ok || !data?.ok || !data?.user) return;
                const user = data.user;
                setAccounts((prev) =>
                    prev.map((acc) =>
                        acc.id !== activeAccount.id
                            ? acc
                            : {
                                ...acc,
                                ...(normalizePermissions(user.permissions) ? { permissions: normalizePermissions(user.permissions) } : {}),
                                ...(user.financialAccess != null ? { financialAccess: user.financialAccess } : {}),
                                inCustomerDirectory: user.inCustomerDirectory !== undefined ? !!user.inCustomerDirectory : acc.inCustomerDirectory,
                            }
                    )
                );
            } catch {
                // ignore
            } finally {
                profileRefreshInFlightRef.current = false;
            }
        })();
        return () => { cancelled = true; };
    }, [activeTab, activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password]);

    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    const MAX_SUPPORT_BOT_URL = "https://max.ru/id9706037094_bot";
    const TG_SUPPORT_BOT_URL = "https://t.me/HAULZinfobot";

    const openExternalLink = (url: string) => {
        const webApp = getWebApp();
        if (webApp && typeof (webApp as any).openLink === "function") {
            (webApp as any).openLink(url);
        } else {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    const openTelegramBotWithAccount = async () => {
        const url = new URL(TG_SUPPORT_BOT_URL);
        const webApp = getWebApp();
        if (webApp && typeof webApp.openTelegramLink === "function") {
            webApp.openTelegramLink(url.toString());
        } else {
            openExternalLink(url.toString());
        }
    };

    const openMaxBotWithAccount = async () => {
        const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
        if (!activeAccount) {
            throw new Error("Сначала выберите компанию.");
        }
        const res = await fetch("/api/max-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                customer: activeAccount.customer || null,
                inn: activeAccount.activeCustomerInn ?? null,
                accountId: activeAccount.id,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) {
            throw new Error(data?.error || "Не удалось создать ссылку для MAX.");
        }
        // По доке MAX диплинк бота: https://max.ru/<botName>?start=<payload> (именно start, не startapp)
        const url = new URL(MAX_SUPPORT_BOT_URL);
        url.searchParams.set("start", `haulz_auth_${data.token}`);
        openMaxBotLink(url.toString());
    };

    const openMaxBotLink = (url: string) => {
        const webApp = getWebApp();
        const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent || ""));
        // Сначала пробуем Bridge.openLink (в MAX может передать ссылку в приложение)
        if (webApp && typeof webApp.openLink === "function") {
            try {
                webApp.openLink(url);
            } catch (e) {
                console.warn("[openMaxBotLink] openLink failed:", e);
            }
        }
        // На телефоне openLink часто не срабатывает — через 100 мс пробуем открыть в этом же окне (уход из мини-аппа на диплинк)
        if (isMobile) {
            setTimeout(() => {
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (!w || w.closed) window.location.href = url;
            }, 100);
            return;
        }
        if (!webApp || typeof webApp.openLink !== "function") {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    const openAiChatDeepLink = (cargoNumber?: string) => {
        if (typeof window !== "undefined" && cargoNumber) {
            window.sessionStorage.setItem(
                "haulz.chat.prefill",
                `Интересует информация по перевозке номер ${cargoNumber}`
            );
            if (activeAccount?.login && activeAccount?.password) {
                const inn = activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
                fetch(PROXY_API_GETPEREVOZKA_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: activeAccount.login,
                        password: activeAccount.password,
                        number: cargoNumber,
                        ...(inn ? { inn } : {}),
                        ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
                    }),
                })
                    .then((r) => r.json())
                    .then((data) => {
                        try {
                            window.sessionStorage.setItem("haulz.chat.cargoPreload", JSON.stringify(data));
                        } catch (_) {}
                    })
                    .catch(() => {});
            }
        }
        setActiveTab("cargo");
    };

    const openCargoFromChat = (cargoNumber: string) => {
        if (!cargoNumber) return;
        const num = String(cargoNumber).trim();
        setSearchText(num);
        handleSearch(num);
        setContextCargoNumber(num);
        setActiveTab("cargo");
    };
    const openCargoFromDocuments = (cargoNumber: string) => {
        if (!cargoNumber) return;
        const num = String(cargoNumber).trim();
        try {
            window.localStorage.setItem("haulz.cargo.tableMode", "true");
        } catch {
            // ignore storage errors
        }
        setSearchText(num);
        handleSearch(num);
        setContextCargoNumber(num);
        setActiveTab("cargo");
    };
    const openClaimFromCargo = (cargoNumber: string) => {
        const number = String(cargoNumber || "").trim();
        if (!number) return;
        try {
            window.localStorage.setItem("haulz.docs.claims.prefillCargoNumber", number);
        } catch {
            // ignore storage errors
        }
        setActiveTab("docs");
    };

    const openDocumentsWithSection = (section: string) => {
        try {
            window.localStorage.setItem("haulz.docs.section", section);
        } catch {
            // ignore
        }
        setActiveTab("docs");
    };

    const [aisOpenWithMmsi, setAisOpenWithMmsi] = useState<string | null>(null);
    const openAisWithMmsi = (mmsi: string) => {
        if (!mmsi || mmsi.replace(/\D/g, "").length !== 9) return;
        setAisOpenWithMmsi(mmsi);
        setActiveTab("profile");
    };

    const [overlayCargoInn, setOverlayCargoInn] = useState<string | null>(null);

    const openCargoInPlace = (cargoNumber: string, inn?: string) => {
        if (!cargoNumber) return;
        setOverlayCargoNumber(cargoNumber);
        setOverlayCargoItem(null);
        setOverlayCargoInn(inn ?? null);
    };

    useEffect(() => {
        if (!overlayCargoNumber || !activeAccount?.login || !activeAccount?.password) {
            if (!overlayCargoNumber) {
                setOverlayCargoItem(null);
                setOverlayCargoInn(null);
            }
            return;
        }
        let cancelled = false;
        setOverlayCargoLoading(true);
        const inn = overlayCargoInn ?? activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
        const numberRaw = String(overlayCargoNumber).replace(/^0+/, '') || overlayCargoNumber;
        const numberForApi = /^\d{5,9}$/.test(numberRaw) ? numberRaw.padStart(9, '0') : overlayCargoNumber;
        fetch(PROXY_API_GETPEREVOZKA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                number: numberForApi,
                ...(inn ? { inn } : {}),
                ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                const raw = Array.isArray(data) ? data[0] : data;
                const statuses = raw?.Statuses ?? raw?.statuses;
                const lastStatus = Array.isArray(statuses) && statuses.length > 0 ? statuses[statuses.length - 1] : null;
                const stateFromStatuses = lastStatus?.Status ?? lastStatus?.status ?? null;
                const item: CargoItem = raw ? {
                    ...raw,
                    Number: raw?.Number ?? raw?.number ?? overlayCargoNumber,
                    DatePrih: raw?.DatePrih ?? raw?.datePrih,
                    DateVr: raw?.DateVr ?? raw?.dateVr,
                    State: raw?.State ?? raw?.state ?? stateFromStatuses ?? undefined,
                    Mest: raw?.Mest ?? raw?.mest,
                    PW: raw?.PW ?? raw?.pw,
                    W: raw?.W ?? raw?.w,
                    Value: raw?.Value ?? raw?.value,
                    Sum: raw?.Sum ?? raw?.sum,
                    StateBill: raw?.StateBill ?? raw?.stateBill,
                    Sender: raw?.Sender ?? raw?.sender,
                    Customer: raw?.Customer ?? raw?.customer,
                    Receiver: raw?.Receiver ?? raw?.receiver,
                    _role: 'Customer',
                } : { Number: overlayCargoNumber, _role: 'Customer' as PerevozkiRole };
                setOverlayCargoItem(item);
            })
            .catch(() => { if (!cancelled) setOverlayCargoItem(null); })
            .finally(() => { if (!cancelled) setOverlayCargoLoading(false); });
        return () => { cancelled = true; };
    }, [overlayCargoNumber, overlayCargoInn, activeAccount?.login, activeAccount?.password, activeAccount?.activeCustomerInn, activeAccount?.customers]);

    const openCargoWithFilters = (filters: { status?: StatusFilter; search?: string }) => {
        if (filters.search) {
            setSearchText(filters.search);
            handleSearch(filters.search);
        }
        setActiveTab("cargo");
    };
    const chatIdentity = (() => {
        const webApp = getWebApp();
        const userId = webApp?.initDataUnsafe?.user?.id;
        const chatId = webApp?.initDataUnsafe?.chat?.id;
        if (userId) return String(userId);
        if (chatId) return String(chatId);
        return null;
    })();

    const upsertRegisteredAccount = (user: any, loginKey: string, password: string): string => {
        const customers: CustomerOption[] = user.inn ? [{ name: user.companyName || user.inn, inn: user.inn }] : [];
        const existingAccount = accounts.find(acc => acc.login === loginKey);
        const normalizedPermissions =
            normalizePermissions(user.permissions)
                ? normalizePermissions(user.permissions)
                : {
                    cargo: true,
                    doc_invoices: true,
                    doc_acts: true,
                    doc_orders: false,
                    doc_sendings: false,
                    doc_claims: true,
                    doc_contracts: false,
                    doc_acts_settlement: false,
                    doc_tariffs: false,
                    haulz: false,
                    eor: false,
                    chat: true,
                };

        if (existingAccount) {
            setAccounts(prev =>
                prev.map(acc =>
                    acc.id === existingAccount.id
                        ? {
                            ...acc,
                            password,
                            customers,
                            // Не перезаписывать activeCustomerInn, если пользователь уже выбрал компанию
                            activeCustomerInn: acc.activeCustomerInn ?? user.inn ?? undefined,
                            customer: user.companyName ?? acc.customer,
                            isRegisteredUser: true,
                            permissions: normalizedPermissions,
                            financialAccess: user.financialAccess ?? acc.financialAccess,
                        }
                        : acc
                )
            );
            return existingAccount.id;
        }

        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
            login: loginKey,
            password,
            id: accountId,
            customers,
            activeCustomerInn: user.inn ?? undefined,
            customer: user.companyName ?? undefined,
            isRegisteredUser: true,
            permissions: normalizedPermissions,
            financialAccess: user.financialAccess ?? false,
        };
        setAccounts(prev => [...prev, newAccount]);
        return accountId;
    };

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setTwoFactorError(null);
        if (!login || !password) return setError("Введите логин и пароль");
        if (!agreeOffer || !agreePersonal) return setError("Подтвердите согласие с условиями");
        if (!authMethods.cms && !authMethods.api_v2 && !authMethods.api_v1) {
            setError("Недоступны способы авторизации");
            return;
        }

        try {
            setLoading(true);
            const loginKey = login.trim().toLowerCase();

            const attemptCmsAuth = async (): Promise<true | string> => {
                const regRes = await fetch("/api/auth-registered-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: loginKey, password }),
                });
                const regData = await regRes.json().catch(() => ({}));
                if (!regRes.ok) {
                    return (typeof regData?.error === "string" ? regData.error : null) || "Неверный email или пароль";
                }
                if (regData?.ok && regData?.user) {
                    const u = regData.user;
                    const existingAccount = accounts.find((acc) => acc.login === loginKey);
                    const customers: CustomerOption[] = u.inn ? [{ name: u.companyName || u.inn, inn: u.inn }] : [];
                    const accessAllInns = !!u.accessAllInns;
                    if (existingAccount) {
                        setAccounts((prev) =>
                            prev.map((acc) =>
                                acc.id === existingAccount.id
                                    ? {
                                        ...acc,
                                        password,
                                        customers,
                                        activeCustomerInn: acc.activeCustomerInn ?? u.inn,
                                        customer: u.companyName,
                                        isRegisteredUser: true,
                                        accessAllInns,
                                        inCustomerDirectory: !!u.inCustomerDirectory,
                                        ...(normalizePermissions(u.permissions) ? { permissions: normalizePermissions(u.permissions) } : {}),
                                        financialAccess: u.financialAccess,
                                    }
                                    : acc
                            )
                        );
                        setActiveAccountId(existingAccount.id);
                    } else {
                        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const newAccount: Account = {
                            login: loginKey,
                            password,
                            id: accountId,
                            customers,
                            activeCustomerInn: u.inn,
                            customer: u.companyName,
                            isRegisteredUser: true,
                            accessAllInns,
                            inCustomerDirectory: !!u.inCustomerDirectory,
                            ...(normalizePermissions(u.permissions) ? { permissions: normalizePermissions(u.permissions) } : {}),
                            financialAccess: u.financialAccess,
                        };
                        setAccounts((prev) => [...prev, newAccount]);
                        setActiveAccountId(accountId);
                    }
                    setActiveTab((prev) => prev || "cargo");
                    return true;
                }
                return "Неверный email или пароль";
            };

            const attemptApiV2Auth = async (): Promise<boolean> => {
                const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, password }),
                });
                if (!customersRes.ok) return false;
                const customersData = await customersRes.json().catch(() => ({}));
                const rawList = Array.isArray(customersData?.customers)
                    ? customersData.customers
                    : Array.isArray(customersData?.Customers)
                        ? customersData.Customers
                        : [];
                const customers: CustomerOption[] = dedupeCustomersByInn(
                    rawList
                        .map((c: any) => ({
                            name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                            inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                        }))
                        .filter((c: CustomerOption) => c.inn.length > 0)
                );
                if (customers.length === 0) return false;
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                if (alreadyAdded) {
                    setError("Компания уже в списке");
                    return true;
                }
                const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
                const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
                const twoFaSettings = twoFaJson?.settings;
                const twoFaEnabled = !!twoFaSettings?.enabled;
                const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
                const twoFaLinked = !!twoFaSettings?.telegramLinked;
                const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
                if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                    const sendRes = await fetch("/api/2fa-telegram", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ login: loginKey, action: "send" }),
                    });
                    if (!sendRes.ok) {
                        const err = await readJsonOrText(sendRes);
                        throw new Error(err?.error || "Не удалось отправить код");
                    }
                    setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "telegram" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                    setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "google" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                const existingAccount = accounts.find((acc) => acc.login === login);
                const firstCustomer = customers[0];
                const firstInn = firstCustomer.inn;
                const firstName = firstCustomer.name;
                if (existingAccount) {
                    setAccounts((prev) =>
                        prev.map((acc) =>
                            acc.id === existingAccount.id
                                ? { ...acc, customers, activeCustomerInn: firstInn, customer: firstName }
                                : acc
                        )
                    );
                    setActiveAccountId(existingAccount.id);
                } else {
                    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: firstInn, customer: firstName };
                    setAccounts((prev) => [...prev, newAccount]);
                    setActiveAccountId(accountId);
                }
                setActiveTab((prev) => prev || "cargo");
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers }),
                })
                    .then((r) => r.json())
                    .then((data) => {
                        if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning);
                    })
                    .catch((err) => console.warn("companies-save error:", err));
                return true;
            };

            const attemptApiV1Auth = async (): Promise<boolean> => {
                const { dateFrom, dateTo } = getDateRange("все");
                const res = await fetch(PROXY_API_BASE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, password, dateFrom, dateTo }),
                });
                await ensureOk(res, "Ошибка авторизации");
                const payload = await readJsonOrText(res);
                const detectedCustomer = extractCustomerFromPerevozki(payload);
                const detectedInn = extractInnFromPerevozki(payload);
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                if (detectedInn && existingInns.has(detectedInn)) {
                    setError("Компания уже в списке");
                    return true;
                }
                const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
                const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
                const twoFaSettings = twoFaJson?.settings;
                const twoFaEnabled = !!twoFaSettings?.enabled;
                const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
                const twoFaLinked = !!twoFaSettings?.telegramLinked;
                const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
                if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                    const sendRes = await fetch("/api/2fa-telegram", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ login: loginKey, action: "send" }),
                    });
                    if (!sendRes.ok) {
                        const err = await readJsonOrText(sendRes);
                        throw new Error(err?.error || "Не удалось отправить код");
                    }
                    setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "telegram" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                    setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "google" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                const existingAccount = accounts.find((acc) => acc.login === login);
                let accountId: string;
                if (existingAccount) {
                    accountId = existingAccount.id;
                    if (detectedCustomer && existingAccount.customer !== detectedCustomer) {
                        setAccounts((prev) =>
                            prev.map((acc) =>
                                acc.id === existingAccount.id
                                    ? { ...acc, customer: detectedCustomer }
                                    : acc
                            )
                        );
                    }
                    setActiveAccountId(accountId);
                } else {
                    accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const newAccount: Account = {
                        login,
                        password,
                        id: accountId,
                        customer: detectedCustomer || undefined,
                        ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
                    };
                    setAccounts((prev) => [...prev, newAccount]);
                    setActiveAccountId(accountId);
                }
                const companyInn = detectedInn ?? "";
                const companyName = detectedCustomer || login.trim() || "Компания";
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
                }).catch(() => {});
                setActiveTab((prev) => prev || "cargo");
                return true;
            };

            let lastError = "Неверный логин или пароль";
            if (authMethods.cms) {
                const cmsResult = await attemptCmsAuth();
                if (cmsResult === true) return;
                lastError = cmsResult;
            }
            if (authMethods.api_v2 && (await attemptApiV2Auth())) return;
            if (authMethods.api_v1 && (await attemptApiV1Auth())) return;
            setError(lastError);
        } catch (err: any) {
            const raw = err?.message || "Ошибка сети.";
            const message = extractErrorMessage(raw) || (typeof raw === "string" ? raw : "Ошибка сети.");
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleTwoFactorSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setTwoFactorError(null);
        if (!pendingLogin?.loginKey || !twoFactorCode.trim()) {
            setTwoFactorError(pendingLogin?.twoFaMethod === "google" ? "Введите код из приложения." : "Введите код из Telegram.");
            return;
        }
        try {
            setTwoFactorLoading(true);
            const isGoogle = pendingLogin.twoFaMethod === "google";
            const res = await fetch(isGoogle ? "/api/2fa-google" : "/api/2fa-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isGoogle
                        ? { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                        : { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                ),
            });
            if (!res.ok) {
                const err = await readJsonOrText(res);
                throw new Error(err?.error || "Неверный код");
            }

            const detectedCustomer = pendingLogin.customer;
            const customers = pendingLogin.customers;
            const firstInn = customers?.length ? customers[0].inn : undefined;
            const existingAccount = accounts.find(acc => acc.login === pendingLogin.login);
            let accountId: string;
            const firstCustomerName = customers?.length ? customers[0].name : undefined;
            if (existingAccount) {
                accountId = existingAccount.id;
                setAccounts(prev =>
                    prev.map(acc =>
                        acc.id === existingAccount.id
                            ? {
                                ...acc,
                                ...(detectedCustomer && acc.customer !== detectedCustomer ? { customer: detectedCustomer } : {}),
                                ...(customers?.length ? { customers, activeCustomerInn: firstInn, customer: firstCustomerName ?? acc.customer } : {}),
                            }
                            : acc
                    )
                );
                setActiveAccountId(accountId);
            } else {
                accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = {
                    login: pendingLogin.login,
                    password: pendingLogin.password,
                    id: accountId,
                    customer: firstCustomerName ?? detectedCustomer ?? undefined,
                    ...(customers?.length ? { customers, activeCustomerInn: firstInn } : {}),
                };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            const loginKeyToSave = pendingLogin.loginKey;
            const customersToSave = pendingLogin.customers;
            const loginDisplay = pendingLogin.login?.trim() || "";

            setActiveTab((prev) => prev || "cargo");
            setTwoFactorPending(false);
            setPendingLogin(null);
            setTwoFactorCode("");

            if (customersToSave?.length) {
                // Способ 2 (Getcustomers): сохраняем список заказчиков в БД
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: customersToSave }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
            } else {
                // Способ 1 (GetPerevozki): одна компания с ИНН из ответа API
                const perevozkiInn = pendingLogin.perevozkiInn ?? "";
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: [{ name: (detectedCustomer ?? loginDisplay) || "Компания", inn: perevozkiInn }] }),
                }).catch(() => {});
            }
        } catch (err: any) {
            setTwoFactorError(err?.message || "Неверный код");
        } finally {
            setTwoFactorLoading(false);
        }
    };

    const handleLogout = () => {
        setAccounts([]);
        setActiveAccountId(null);
        setActiveTab("cargo");
        setPassword(""); 
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("haulz.auth");
                window.localStorage.removeItem("haulz.accounts");
                window.localStorage.removeItem("haulz.activeAccountId");
            } catch {
                // игнорируем ошибки удаления
            }
        }
        setIsSearchExpanded(false); setSearchText('');
    }
    
    // Удаление аккаунта
    const handleRemoveAccount = (accountId: string) => {
        const newAccounts = accounts.filter(acc => acc.id !== accountId);
        setAccounts(newAccounts);
        setSelectedAccountIds((prev) => {
            const next = prev.filter((id) => id !== accountId);
            if (next.length === 0 && newAccounts.length > 0) return [newAccounts[0].id];
            return next;
        });
        if (activeAccountId === accountId) {
            if (newAccounts.length > 0) {
                setActiveAccountId(newAccounts[0].id);
            } else {
                setActiveAccountId(null);
                setActiveTab("cargo");
            }
        }
    };
    
    // Переключение аккаунта (одна компания — подставляем как единственную выбранную)
    const handleSwitchAccount = (accountId: string) => {
        setActiveAccountId(accountId);
        setSelectedAccountIds([accountId]);
    };

    // Подключить/отключить компанию в мультивыборе (для списка перевозок)
    const handleToggleSelectedAccount = (accountId: string) => {
        setSelectedAccountIds((prev) => {
            const has = prev.includes(accountId);
            if (has) {
                if (prev.length <= 1) return prev;
                const next = prev.filter((id) => id !== accountId);
                setActiveAccountId(next[0] ?? null);
                return next;
            }
            const next = [...prev, accountId];
            if (prev.length === 0) setActiveAccountId(accountId);
            return next;
        });
    };


    // Обновление полей аккаунта (например, 2FA настройки)
    const handleUpdateAccount = (accountId: string, patch: Partial<Account>) => {
        let target: Account | null = null;
        setAccounts(prev => {
            const next = prev.map(acc => acc.id === accountId ? { ...acc, ...patch } : acc);
            target = next.find(acc => acc.id === accountId) || null;
            return next;
        });
        if (target && ("twoFactorEnabled" in patch || "twoFactorMethod" in patch || "twoFactorTelegramLinked" in patch)) {
            void persistTwoFactorSettings(target, patch);
        }
    };
    
    const handleAddAccount = async (login: string, password: string) => {
        if (accounts.find(acc => acc.login === login)) {
            throw new Error("Аккаунт с таким логином уже добавлен");
        }

        const loginKey = login.trim().toLowerCase();

        // Сначала пробуем способ 2 (Getcustomers)
        const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
        if (customersRes.ok) {
            const customersData = await customersRes.json().catch(() => ({}));
            const rawList = Array.isArray(customersData?.customers) ? customersData.customers : Array.isArray(customersData?.Customers) ? customersData.Customers : [];
            const customers: CustomerOption[] = dedupeCustomersByInn(
                rawList.map((c: any) => ({
                    name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                    inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                })).filter((c: CustomerOption) => c.inn.length > 0)
            );
            if (customers.length > 0) {
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                if (alreadyAdded) {
                    throw new Error("Компания уже в списке");
                }
                const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: customers[0].inn, customer: customers[0].name };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
                return;
            }
        }

        // Способ 1 (GetPerevozki)
        const { dateFrom, dateTo } = getDateRange("все");
        const res = await fetch(PROXY_API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password, dateFrom, dateTo }),
        });
        if (!res.ok) {
            let message = `Ошибка авторизации`;
            try {
                const payload = await readJsonOrText(res);
                const extracted = extractErrorMessage(payload);
                if (extracted) message = extracted;
            } catch { }
            throw new Error(message);
        }
        const payload = await readJsonOrText(res);
        const detectedCustomer = extractCustomerFromPerevozki(payload);
        const detectedInn = extractInnFromPerevozki(payload);
        const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
        if (detectedInn && existingInns.has(detectedInn)) {
            throw new Error("Компания уже в списке");
        }
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
            login,
            password,
            id: accountId,
            customer: detectedCustomer || undefined,
            ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
        };
        setAccounts(prev => [...prev, newAccount]);
        setActiveAccountId(accountId);
        const companyInn = detectedInn ?? "";
        const companyName = detectedCustomer || login.trim() || "Компания";
        fetch("/api/companies-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
        }).catch(() => {});
    };

    // 404 для неизвестного path (не "/", "/admin", "/cms")
    if (typeof window !== "undefined" && shouldShowNotFound()) {
        return <NotFoundPage onGoHome={() => { window.location.href = "/"; }} />;
    }

    // Админка: постоянные ссылки /admin, /cms или ?tab=cms
    const isCmsStandalone =
        typeof window !== "undefined" &&
        (new URL(window.location.href).searchParams.get("tab") === "cms" ||
            /^\/(admin|cms)\/?$/i.test(window.location.pathname));
    if (isCmsStandalone) {
        return <CMSStandalonePage />;
    }

    if (!auth && showForgotPage) {
        return (
            <ForgotPasswordPage
                initialEmail={login}
                onBackToLogin={() => {
                    setShowForgotPage(false);
                    try {
                        const u = new URL(window.location.href);
                        u.searchParams.delete("forgot");
                        window.history.replaceState(null, "", u.toString());
                    } catch {
                        // ignore
                    }
                }}
            />
        );
    }

    if (!auth) {
        return (
            <>
                <Container className={`app-container login-form-wrapper`}>
                <Panel mode="secondary" className="login-card">
                    <Flex justify="center" className="mb-4 h-10 mt-6">
                        <Typography.Title className="logo-text">HAULZ</Typography.Title>
                    </Flex>
                    <Typography.Body className="tagline">
                        Доставка грузов в Калининград и обратно
                    </Typography.Body>
                    {twoFactorPending ? (
                        <form onSubmit={handleTwoFactorSubmit} className="form">
                            <Typography.Body style={{ marginBottom: '0.75rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                {pendingLogin?.twoFaMethod === "google" ? "Введите 6-значный код из приложения" : "Введите код из Telegram"}
                            </Typography.Body>
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder={pendingLogin?.twoFaMethod === "google" ? "000000" : "Код подтверждения"}
                                    value={twoFactorCode}
                                    onChange={(e) => setTwoFactorCode(pendingLogin?.twoFaMethod === "google" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
                                />
                            </div>
                            <Button className="button-primary" type="submit" disabled={twoFactorLoading}>
                                {twoFactorLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить код"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                                {pendingLogin?.twoFaMethod === "telegram" && (
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={async () => {
                                        if (!pendingLogin?.loginKey) return;
                                        try {
                                            setTwoFactorError(null);
                                            setTwoFactorLoading(true);
                                            const resend = await fetch("/api/2fa-telegram", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ login: pendingLogin.loginKey, action: "send" }),
                                            });
                                            if (!resend.ok) {
                                                const err = await readJsonOrText(resend);
                                                throw new Error(err?.error || "Не удалось отправить код");
                                            }
                                        } catch (err: any) {
                                            setTwoFactorError(err?.message || "Не удалось отправить код");
                                        } finally {
                                            setTwoFactorLoading(false);
                                        }
                                    }}
                                >
                                    Отправить код еще раз
                                </Button>
                                )}
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={() => {
                                        setTwoFactorPending(false);
                                        setPendingLogin(null);
                                        setTwoFactorCode("");
                                    }}
                                >
                                    Назад
                                </Button>
                            </Flex>
                            {twoFactorError && (
                                <Flex align="center" className="login-error mt-4">
                                    <AlertTriangle className="w-5 h-5 mr-2" />
                                    <Typography.Body>{twoFactorError}</Typography.Body>
                                </Flex>
                            )}
                        </form>
                    ) : (
                        <form onSubmit={handleLoginSubmit} className="form">
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    placeholder="Логин (email)"
                                    value={login}
                                    onChange={(e) => setLogin(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                            <div className="field">
                                <div className="password-input-container">
                                    <Input
                                        className="login-input password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Пароль"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                        style={{paddingRight: '3rem'}}
                                    />
                                    <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </Button>
                                </div>
                            </div>
                            {/* ТУМБЛЕРЫ ВОССТАНОВЛЕНЫ */}
                            <label className="checkbox-row switch-wrapper">
                                <Typography.Body>
                                    Согласие с{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsOfferOpen(true); }}>
                                        публичной офертой
                                    </a>
                                </Typography.Body>
                                <Switch
                                    checked={agreeOffer}
                                    onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                                    onChange={(event) => setAgreeOffer(resolveChecked(event))}
                                />
                            </label>
                            <label className="checkbox-row switch-wrapper">
                                <Typography.Body>
                                    Согласие на{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsPersonalConsentOpen(true); }}>
                                        обработку данных
                                    </a>
                                </Typography.Body>
                                <Switch
                                    checked={agreePersonal}
                                    onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
                                    onChange={(event) => setAgreePersonal(resolveChecked(event))}
                                />
                            </label>
                            <Button className="button-primary" type="submit" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '1rem' }}>
                                <button
                                    type="button"
                                    style={{
                                        color: 'var(--color-primary-blue)',
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        fontSize: '0.9rem',
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                    }}
                                    onClick={() => {
                                        setShowForgotPage(true);
                                        try {
                                            const u = new URL(window.location.href);
                                            u.searchParams.set('forgot', '1');
                                            window.history.pushState(null, '', u.toString());
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                >
                                    Забыли пароль?
                                </button>
                            </Flex>
                        </form>
                    )}
                    {error && (
                        <Flex align="center" className="login-error mt-4">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            <Typography.Body>{error}</Typography.Body>
                        </Flex>
                    )}
                    <LegalModal isOpen={!!isOfferOpen} onClose={() => setIsOfferOpen(false)} title="Публичная оферта">
                        {PUBLIC_OFFER_TEXT}
                    </LegalModal>
                    <LegalModal isOpen={!!isPersonalConsentOpen} onClose={() => setIsPersonalConsentOpen(false)} title="Согласие на обработку персональных данных">
                        {PERSONAL_DATA_CONSENT_TEXT}
                    </LegalModal>
                </Panel>
                </Container>
            </>
        );
    }

    if (isWbOnlyUser) {
        return (
            <WbOnlyAppLayout desktopExpanded={desktopExpanded} onLogout={handleLogout}>
                <AppRuntimeProvider
                    value={{
                        useServiceRequest: false,
                        searchText,
                        activeInn: activeAccount?.activeCustomerInn ?? auth?.inn ?? "",
                    }}
                >
                    <AppMainContent
                        showDashboard={false}
                        activeTab={WB_TAB}
                        auth={auth}
                        selectedAuths={selectedAuths}
                        accounts={accounts}
                        activeAccountId={activeAccountId}
                        activeAccount={activeAccount}
                        contextCargoNumber={contextCargoNumber}
                        useServiceRequest={false}
                        setContextCargoNumber={setContextCargoNumber}
                        setActiveTab={setActiveTab}
                        setSelectedAccountIds={setSelectedAccountIds}
                        setActiveAccountId={setActiveAccountId}
                        updateActiveAccountCustomer={updateActiveAccountCustomer}
                        openCargoWithFilters={openCargoWithFilters}
                        openCargoFromChat={openCargoFromChat}
                        openCargoFromDocuments={openCargoFromDocuments}
                        openClaimFromCargo={openClaimFromCargo}
                        openDocumentsWithSection={openDocumentsWithSection}
                        openAisWithMmsi={openAisWithMmsi}
                        aisOpenWithMmsi={aisOpenWithMmsi}
                        setAisOpenWithMmsi={setAisOpenWithMmsi}
                        openTelegramBotWithAccount={openTelegramBotWithAccount}
                        handleSwitchAccount={handleSwitchAccount}
                        handleAddAccount={handleAddAccount}
                        handleRemoveAccount={handleRemoveAccount}
                        handleUpdateAccount={handleUpdateAccount}
                        setIsOfferOpen={setIsOfferOpen}
                        setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                        openSecretPinModal={openSecretPinModal}
                        openWildberries={() => setActiveTab(WB_TAB)}
                        CargoDetailsModal={CargoDetailsModal}
                        DashboardPageComponent={DashboardPage}
                        ProfilePageComponent={ProfilePage}
                        DocumentsPageComponent={DocumentsPage}
                    />
                </AppRuntimeProvider>
            </WbOnlyAppLayout>
        );
    }

    return (
        <>
            <Container className={`app-container`}>
            <header className={`app-header${desktopExpanded ? " app-header-wide" : ""}`}>
                    <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info" style={{ position: 'relative', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {!isWildberriesTab(activeTab) && !useServiceRequest && activeAccountId && activeAccount && (
                            <CustomerSwitcher
                                accounts={accounts}
                                activeAccountId={activeAccountId}
                                onSwitchAccount={handleSwitchAccount}
                                onUpdateAccount={handleUpdateAccount}
                            />
                        )}
                        {!isWildberriesTab(activeTab) && serviceModeUnlocked && (
                            <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
                                <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Служ.</Typography.Label>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={useServiceRequest}
                                        onToggle={() => setUseServiceRequest(v => !v)}
                                    />
                                </span>
                                <Button
                                    className="search-toggle-button desktop-expand-toggle"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDesktopExpanded((prev) => !prev);
                                    }}
                                    title={desktopExpanded ? "Обычная ширина" : "Расширить окно"}
                                    aria-label={desktopExpanded ? "Обычная ширина" : "Расширить окно"}
                                >
                                    {desktopExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                                </Button>
                                {useServiceRequest && (
                                    <Button
                                        className="search-toggle-button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setServiceRefreshSpinning(true);
                                            window.setTimeout(() => setServiceRefreshSpinning(false), 1500);
                                            window.dispatchEvent(new CustomEvent('haulz-service-refresh'));
                                        }}
                                        title="Обновить данные"
                                        aria-label="Обновить данные"
                                        disabled={serviceRefreshSpinning}
                                    >
                                        {serviceRefreshSpinning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4" />
                                        )}
                                    </Button>
                                )}
                            </Flex>
                        )}
                    </Flex>
                    <Flex align="center" className="space-x-3">
                        {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug") && (
                            <div ref={debugMenuRef} style={{ position: "relative" }}>
                                <Button
                                    type="button"
                                    className="search-toggle-button"
                                    onClick={(e) => { e.stopPropagation(); setDebugMenuOpen((v) => !v); }}
                                    title="Меню отладки"
                                    aria-label="Меню отладки"
                                    aria-expanded={debugMenuOpen}
                                >
                                    <Settings className="w-5 h-5" />
                                </Button>
                                {debugMenuOpen && (
                                    <div
                                        className="filter-dropdown"
                                        role="menu"
                                        style={{
                                            position: "absolute",
                                            right: 0,
                                            top: "100%",
                                            marginTop: "0.25rem",
                                            minWidth: "200px",
                                            padding: "0.5rem 0",
                                            background: "var(--color-bg-elevated, #fff)",
                                            border: "1px solid var(--color-border, #e5e7eb)",
                                            borderRadius: "0.5rem",
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                            zIndex: 1000,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={() => { window.location.reload(); }}
                                        >
                                            Обновить страницу
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={() => {
                                                try {
                                                    ["haulz.accounts", "haulz.activeAccountId", "haulz.selectedAccountIds", "haulz.auth", "haulz.dateFilterState", "haulz.theme", "haulz.favorites", "haulz.cargo.tableMode", "haulz.docs.tableMode", "haulz.docs.section"].forEach((k) => window.localStorage.removeItem(k));
                                                } catch { /* ignore */ }
                                                window.location.reload();
                                            }}
                                        >
                                            Очистить данные и обновить
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={async () => {
                                                const info = {
                                                    url: window.location.href,
                                                    userAgent: navigator.userAgent,
                                                    localStorageKeys: Object.keys(window.localStorage).filter((k) => k.startsWith("haulz.")),
                                                };
                                                try {
                                                    await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
                                                    setDebugMenuOpen(false);
                                                } catch { /* ignore */ }
                                            }}
                                        >
                                            Копировать инфо для отладки
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isWildberriesTab(activeTab) && (
                            <Button className="search-toggle-button" onClick={() => { setIsSearchExpanded(!isSearchExpanded); if(isSearchExpanded) { handleSearch(''); setSearchText(''); } }}>
                                {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                            </Button>
                        )}
                        <Button
                            className="search-toggle-button"
                            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
                            title={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
                            aria-label={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
                        >
                            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        </Button>
                        <Button className="search-toggle-button" onClick={handleLogout} title="Выход" aria-label="Выйти">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </Flex>
                </Flex>
                {!isWildberriesTab(activeTab) && (
                    <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                        <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                        <Input type="search" placeholder="Поиск..." className="search-input" value={searchText} onChange={(e) => { setSearchText(e.target.value); handleSearch(e.target.value); }} />
                        {searchText && <Button className="search-toggle-button" onClick={() => { setSearchText(''); handleSearch(''); }} aria-label="Очистить поиск"><X className="w-4 h-4" /></Button>}
                    </div>
                )}
            </header>
            <div className={`app-main${desktopExpanded ? " app-main-wide" : ""}`}>
                <div className="w-full">
                    <AppRuntimeProvider
                        value={{
                            useServiceRequest,
                            searchText,
                            activeInn: activeAccount?.activeCustomerInn ?? auth?.inn ?? "",
                        }}
                    >
                        <AppMainContent
                            showDashboard={showDashboard}
                            activeTab={activeTab}
                            auth={auth}
                            selectedAuths={selectedAuths}
                            accounts={accounts}
                            activeAccountId={activeAccountId}
                            activeAccount={activeAccount}
                            contextCargoNumber={contextCargoNumber}
                            useServiceRequest={useServiceRequest}
                            setContextCargoNumber={setContextCargoNumber}
                            setActiveTab={setActiveTab}
                            setSelectedAccountIds={setSelectedAccountIds}
                            setActiveAccountId={setActiveAccountId}
                            updateActiveAccountCustomer={updateActiveAccountCustomer}
                            openCargoWithFilters={openCargoWithFilters}
                            openCargoFromChat={openCargoFromChat}
                            openCargoFromDocuments={openCargoFromDocuments}
                            openClaimFromCargo={openClaimFromCargo}
                            openDocumentsWithSection={openDocumentsWithSection}
                            openAisWithMmsi={openAisWithMmsi}
                            aisOpenWithMmsi={aisOpenWithMmsi}
                            setAisOpenWithMmsi={setAisOpenWithMmsi}
                            openTelegramBotWithAccount={openTelegramBotWithAccount}
                            handleSwitchAccount={handleSwitchAccount}
                            handleAddAccount={handleAddAccount}
                            handleRemoveAccount={handleRemoveAccount}
                            handleUpdateAccount={handleUpdateAccount}
                            setIsOfferOpen={setIsOfferOpen}
                            setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                            openSecretPinModal={openSecretPinModal}
                            openWildberries={() => setActiveTab(WB_TAB)}
                            CargoDetailsModal={CargoDetailsModal}
                            DashboardPageComponent={DashboardPage}
                            ProfilePageComponent={ProfilePage}
                            DocumentsPageComponent={DocumentsPage}
                        />
                    </AppRuntimeProvider>
            </div>
            </div>
            <TabBar 
                active={activeTab} 
                onChange={(tab) => {
                    if (showDashboard) {
                        if (tab === "home") {
                            // При клике на "Главная" переходим на дашборд, но не выходим из секретного режима
                            setActiveTab("dashboard");
                        } else if (tab === "cargo") {
                            // При клике на "Грузы" переходим на грузы, но остаемся в секретном режиме
                            setActiveTab("cargo");
                        } else {
                            setActiveTab(tab);
                        }
                    } else {
                        if (tab === "home") setActiveTab("dashboard");
                        else setActiveTab(tab);
                    }
                }}
                // вход в секретный режим теперь через "Уведомления" в профиле
                showAllTabs={true}
                permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions ?? undefined : undefined}
                expanded={desktopExpanded}
            />

            <LegalModal isOpen={!!isOfferOpen} onClose={() => setIsOfferOpen(false)} title="Публичная оферта">
                {PUBLIC_OFFER_TEXT}
            </LegalModal>
            <LegalModal isOpen={!!isPersonalConsentOpen} onClose={() => setIsPersonalConsentOpen(false)} title="Согласие на обработку персональных данных">
                {PERSONAL_DATA_CONSENT_TEXT}
            </LegalModal>
            
            {/* Модальное окно для ввода пин-кода */}
            {showPinModal && (
                <div className="modal-overlay" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <Button className="modal-close-button" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }} aria-label="Закрыть">
                                <X size={20} />
                            </Button>
                        </div>
                        <form onSubmit={handlePinSubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <Input
                                    type="password"
                                    className="login-input"
                                    placeholder=""
                                    value={pinCode}
                                    onChange={(e) => {
                                        setPinCode(e.target.value);
                                        setPinError(false);
                                    }}
                                    autoFocus
                                    maxLength={4}
                                    style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
                                />
                                {pinError && (
                                    <Typography.Body className="login-error" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                                        Неверный пин-код
                                    </Typography.Body>
                                )}
                            </div>
                            <Button className="button-primary" type="submit" style={{ width: '100%' }}>
                                Войти
                            </Button>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Карточка перевозки поверх счёта (из раздела Документы) — zIndex 10000 чтобы быть выше InvoiceDetailModal (9998) */}
            {overlayCargoNumber && activeAccount && (
                overlayCargoLoading ? (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => { setOverlayCargoNumber(null); setOverlayCargoItem(null); setOverlayCargoInn(null); }}>
                        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
                    </div>
                ) : overlayCargoItem ? (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
                    <CargoDetailsModal
                        item={overlayCargoItem}
                        isOpen={true}
                        onClose={() => { setOverlayCargoNumber(null); setOverlayCargoItem(null); setOverlayCargoInn(null); }}
                        auth={{ login: activeAccount.login, password: activeAccount.password, inn: (overlayCargoInn ?? activeAccount.activeCustomerInn ?? undefined) || undefined, ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}) }}
                        onOpenChat={undefined}
                        showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : true}
                        useServiceRequest={useServiceRequest}
                        isFavorite={(n) => { try { const raw = localStorage.getItem('haulz.favorites'); const arr = raw ? JSON.parse(raw) : []; return arr.includes(n); } catch { return false; } }}
                        onToggleFavorite={(n) => { if (!n) return; try { const raw = localStorage.getItem('haulz.favorites'); const arr = raw ? JSON.parse(raw) : []; const set = new Set(arr); if (set.has(n)) set.delete(n); else set.add(n); localStorage.setItem('haulz.favorites', JSON.stringify([...set])); setOverlayFavVersion(v => v + 1); } catch {} }}
                    />
                    </div>
                ) : null
            )}

            <ChatModal
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                userId={auth?.login || "anon"}
            />
            </Container>
        </>
    );
}
