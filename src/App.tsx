import React, { FormEvent, useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, Suspense, lazy } from "react";
import {
    LogOut, Truck, Loader2, Check, X, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Users, Scale, RussianRuble, List, Download, Maximize, Minimize2,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, TrendingDown, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart, Building2, Bell, Shield, Settings, Info, ArrowLeft, Plus, Trash2, MapPin, Phone, Mail, Share2, Mic, Square, Ship, RefreshCw, Lock, Moon, Sun
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import "./styles.css";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppMainContent } from "./components/AppMainContent";
import { AppHeader } from "./components/AppHeader";
import { AppTabBar } from "./components/AppTabBar";
import { AppShellModals } from "./components/AppShellModals";
import { LoginScreen } from "./components/LoginScreen";
import { getWebApp, isMaxWebApp, isMaxDocsEnabled } from "./webApp";
import { applyClientPlatformToDocument, getClientPlatform, isClientMobile } from "./lib/clientPlatform";
import { DOCUMENT_METHODS } from "./documentMethods";
const DashboardPage = lazyWithRetry(
    () => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
    "DashboardPage"
);

import { TapSwitch } from "./components/TapSwitch";
import { DateText } from "./components/ui/DateText";
import { DetailItem } from "./components/ui/DetailItem";
import { FilterDialog } from "./components/shared/FilterDialog";
import { StatusBadge, StatusBillBadge } from "./components/shared/StatusBadges";
import { normalizeStatus, getFilterKeyByStatus, getPaymentFilterKey, getSumColorByPaymentStatus, isReceivedInfoStatus, BILL_STATUS_MAP, STATUS_MAP } from "./lib/statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./lib/slaWorkSchedule";
import type { BillStatusFilterKey } from "./lib/statusUtils";
import { CustomPeriodModal } from "./components/modals/CustomPeriodModal";
import { CargoDetailsModal } from "./components/modals/CargoDetailsModal";
const DocumentsPage = lazyWithRetry(
    () => import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
    "DocumentsPage"
);
const NotFoundPage = lazyWithRetry(
    () => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
    "NotFoundPage"
);
const CMSStandalonePage = lazyWithRetry(
    () => import("./pages/CMSStandalonePage").then((m) => ({ default: m.CMSStandalonePage })),
    "CMSStandalonePage"
);
const CargoPage = lazyWithRetry(
    () => import("./pages/CargoPage").then((m) => ({ default: m.CargoPage })),
    "CargoPage"
);
const ProfilePage = lazyWithRetry(
    () => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
    "ProfilePage"
);
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { AuthProvider, useAuth, normalizePermissions } from "./contexts/AuthContext";
import { AppShellProvider, useAppShell } from "./contexts/AppShellContext";
import { AppNavigationProvider } from "./contexts/AppNavigationContext";
import { shouldShowNotFound } from "./lib/notFoundRoute";
import {
    WB_TAB,
    isWbOnlyAccount,
    isWildberriesTab,
    WbOnlyAppLayout,
} from "./wb/appWb";
import { HAULZ_SPLASH_BACKGROUND } from "./constants/brand";
import { postAuthRegisteredLogin } from "./api/client/auth";
import {
    fetchTwoFaSettings,
} from "./api/client/twoFa";
import { useLegalCompliance } from "./hooks/useLegalCompliance";
import { getSlaInfo, getPlanDays, getInnFromCargo, isFerry } from "./lib/cargoUtils";
import * as dateUtils from "./lib/dateUtils";
import { formatCurrency, stripOoo, formatInvoiceNumber, cityToCode, transliterateFilename, normalizeInvoiceStatus, parseCargoNumbersFromText } from "./lib/formatUtils";
import { usePerevozki, usePerevozkiMulti, usePerevozkiMultiAccounts, usePrevPeriodPerevozki, useInvoices } from "./hooks/useApi";
import { useShowCustomerColumn } from "./hooks/useShowCustomerColumn";
import {
    hasStaleActiveCustomerInn,
    isSingleRegisteredCustomerAccount,
    normalizeAccountCustomerSelection,
} from "./lib/accountCustomer";
import type {
    Account, AccountPermissions, ApiError, AuthData, CargoItem, CompanyRow, CustomerOption,
    PerevozkiRole, ProfileView, StatusFilter, Tab,
} from "./types";

const { getDateRange } = dateUtils;

function lazyWithRetry<T extends React.ComponentType<any>>(
    importer: () => Promise<{ default: T }>,
    chunkKey: string
) {
    return lazy(async () => {
        try {
            return await importer();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? "");
            const isChunkLoadError =
                /Failed to fetch dynamically imported module/i.test(message) ||
                /Importing a module script failed/i.test(message) ||
                /Loading chunk [\d]+ failed/i.test(message);
            if (typeof window !== "undefined" && isChunkLoadError) {
                const marker = `haulz.chunk-retry:${chunkKey}`;
                try {
                    const alreadyRetried = window.sessionStorage.getItem(marker) === "1";
                    if (!alreadyRetried) {
                        window.sessionStorage.setItem(marker, "1");
                        const url = new URL(window.location.href);
                        url.searchParams.set("__chunk_retry", String(Date.now()));
                        window.location.replace(url.toString());
                        return await new Promise<never>(() => {
                            // keep pending while browser navigates
                        });
                    }
                    window.sessionStorage.removeItem(marker);
                } catch {
                    // ignore storage access issues and rethrow original error
                }
            }
            throw error;
        }
    });
}


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

function AppRoot() {
    const {
        accounts,
        setAccounts,
        activeAccountId,
        setActiveAccountId,
        selectedAccountIds,
        setSelectedAccountIds,
        auth,
        activeAccount,
        selectedAuths,
        updateActiveAccountCustomer,
    } = useAuth();
    const {
        theme,
        setTheme,
        desktopExpanded,
        setDesktopExpanded,
        activeTab,
        setActiveTab,
        hasRestoredTabRef,
        hasUrlTabOverrideRef,
    } = useAppShell();

    useEffect(() => {
        applyClientPlatformToDocument();
    }, []);

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

                // Тот же синий, что PWA splash — оверскролл и скругления webview не чёрные (Telegram / MAX).
                if (typeof webApp.setBackgroundColor === "function") {
                    webApp.setBackgroundColor(HAULZ_SPLASH_BACKGROUND);
                }
                if (isMaxWebApp()) {
                    if (typeof webApp.setHeaderColor === "function") {
                        webApp.setHeaderColor("#2563eb");
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
                if (scheme === "dark" || scheme === "light") setTheme(scheme as "light" | "dark");
            };

            if (typeof webApp.onEvent === "function") {
                webApp.onEvent("themeChanged", themeHandler);
                cleanupHandler = () => webApp.offEvent?.("themeChanged", themeHandler);
            }

            applyClientPlatformToDocument();
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
    }, [setTheme]);

    const [useServiceRequest, setUseServiceRequest] = useState(false);
    const [serviceRefreshSpinning, setServiceRefreshSpinning] = useState(false);

    const legalCompliance = useLegalCompliance(activeAccount);

    const showCustomerColumn = useShowCustomerColumn(activeAccount, useServiceRequest);

    /** Оболочка HAULZ Analytics (CSS-токены, motion на главных экранах) — для всех пользователей. */
    const profileSaasShellActive = true;

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
    useEffect(() => {
        if (!activeAccount?.login) return;
        let cancelled = false;
        const load = async () => {
            try {
                const data = await fetchTwoFaSettings(activeAccount.login);
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
    const [showDashboard, setShowDashboard] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinCode, setPinCode] = useState('');
    const [pinError, setPinError] = useState(false);
    const registeredLoginRefreshInFlightRef = useRef(false);
    const syncedRegisteredAccountsRef = useRef<Set<string>>(new Set());

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

    // Журнал разделов приложения для админ-отчёта активности (debounce; без учёта фоновых refresh входа).
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!activeAccount?.isRegisteredUser || !activeAccount.login || !activeAccount.password) return;
        const section = String(activeTab);
        const login = activeAccount.login;
        const password = activeAccount.password;
        const t = window.setTimeout(() => {
            void fetch("/api/app-activity-beacon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login,
                    password,
                    section,
                    platform: getClientPlatform().platform,
                }),
                keepalive: true,
            }).catch(() => {});
        }, 650);
        return () => window.clearTimeout(t);
    }, [activeTab, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password]);

    // Подтянуть данные зарегистрированного пользователя с бэкенда (в т.ч. inCustomerDirectory из справочника заказчиков в БД)
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        const needRefresh = accounts.filter(
            (acc) =>
                acc.isRegisteredUser &&
                acc.password &&
                (!acc.customers?.length ||
                    !acc.activeCustomerInn ||
                    acc.inCustomerDirectory === undefined ||
                    hasStaleActiveCustomerInn(acc))
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
                        const { ok, data } = await postAuthRegisteredLogin({
                            email: acc.login.trim().toLowerCase(),
                            password: acc.password,
                            activity: "silent",
                        });
                        if (cancelled || !ok || !data?.ok || !data?.user) continue;
                        const u = data.user as Record<string, unknown>;
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
                        const merged: Account = {
                            ...a,
                            customers:
                                !up.accessAllInns && up.customers.length > 0
                                    ? up.customers
                                    : (a.customers?.length ? (a.customers ?? up.customers) : up.customers),
                            accessAllInns: up.accessAllInns,
                            inCustomerDirectory: up.inCustomerDirectory,
                            ...(up.permissions != null ? { permissions: up.permissions } : {}),
                            ...(up.financialAccess != null ? { financialAccess: up.financialAccess } : {}),
                        };
                        if (!up.accessAllInns && up.customers.length === 1) {
                            merged.activeCustomerInn = up.customers[0].inn;
                            merged.customer = up.customers[0].name ?? up.customer ?? undefined;
                        } else if (!up.accessAllInns && up.activeCustomerInn) {
                            merged.activeCustomerInn = up.activeCustomerInn ?? undefined;
                            merged.customer = up.customer ?? merged.customer;
                        } else {
                            merged.activeCustomerInn = a.activeCustomerInn ?? up.activeCustomerInn ?? undefined;
                            merged.customer = hadCustomers ? (a.customer ?? up.customer ?? undefined) : (up.customer ?? undefined);
                        }
                        return normalizeAccountCustomerSelection(merged);
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
                const { ok, data } = await postAuthRegisteredLogin({
                    email: activeAccount.login.trim().toLowerCase(),
                    password: activeAccount.password,
                    activity: "silent",
                });
                if (cancelled || !ok || !data?.ok || !data?.user) return;
                const user = data.user as Record<string, unknown>;
                const customers: CustomerOption[] = user.inn ? [{ name: user.companyName || user.inn, inn: user.inn }] : [];
                const accessAllInns = !!user.accessAllInns;
                setAccounts((prev) =>
                    prev.map((acc) => {
                        if (acc.id !== activeAccount.id) return acc;
                        const merged: Account = {
                            ...acc,
                            customers:
                                !accessAllInns && customers.length > 0 ? customers : (acc.customers?.length ? acc.customers : customers),
                            accessAllInns,
                            inCustomerDirectory: !!user.inCustomerDirectory,
                            ...(normalizePermissions(user.permissions) ? { permissions: normalizePermissions(user.permissions) } : {}),
                            ...(user.financialAccess != null ? { financialAccess: user.financialAccess } : {}),
                        };
                        if (!accessAllInns && customers.length === 1) {
                            merged.activeCustomerInn = customers[0].inn;
                            merged.customer = customers[0].name ?? (user.companyName as string | undefined);
                        } else if (!accessAllInns && user.inn) {
                            merged.activeCustomerInn = String(user.inn);
                            merged.customer = (user.companyName as string | undefined) ?? merged.customer;
                        } else {
                            merged.activeCustomerInn = acc.activeCustomerInn ?? (user.inn as string | undefined) ?? undefined;
                            merged.customer = acc.customer ?? (user.companyName as string | undefined) ?? undefined;
                        }
                        return normalizeAccountCustomerSelection(merged);
                    })
                );
            } catch {
                // ignore best-effort refresh errors
            }
        })();
        return () => { cancelled = true; };
    }, [activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password]);

    // CMS-учётка с одним заказчиком: сразу выставить ИНН/название из профиля (не чужой customer из localStorage)
    useEffect(() => {
        if (!activeAccount?.id) return;
        if (!isSingleRegisteredCustomerAccount(activeAccount) && !hasStaleActiveCustomerInn(activeAccount)) return;
        const normalized = normalizeAccountCustomerSelection(activeAccount);
        if (
            normalized.activeCustomerInn === activeAccount.activeCustomerInn &&
            normalized.customer === activeAccount.customer
        ) {
            return;
        }
        setAccounts((prev) => prev.map((a) => (a.id === activeAccount.id ? normalized : a)));
    }, [
        activeAccount?.id,
        activeAccount?.activeCustomerInn,
        activeAccount?.customer,
        activeAccount?.customers,
        activeAccount?.isRegisteredUser,
        activeAccount?.accessAllInns,
    ]);

    // Если в account_companies одна компания — подставить её (для логинов 1С / смешанных учёток)
    useEffect(() => {
        if (!activeAccount?.login || activeAccount.accessAllInns) return;
        if (isSingleRegisteredCustomerAccount(activeAccount) && (activeAccount.customers?.length ?? 0) === 1) return;
        const loginKey = activeAccount.login.trim().toLowerCase();
        let cancelled = false;
        fetch(`/api/companies?login=${encodeURIComponent(loginKey)}`)
            .then((r) => r.json())
            .then((data: { companies?: { login: string; inn: string; name: string }[] }) => {
                if (cancelled) return;
                const list = (data.companies ?? []).filter((c) => c.login === loginKey && (c.inn || "").trim());
                if (list.length !== 1) return;
                const only = list[0];
                if (only.inn === activeAccount.activeCustomerInn && only.name === activeAccount.customer) return;
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === activeAccount.id
                            ? { ...a, activeCustomerInn: only.inn, customer: only.name || a.customer }
                            : a
                    )
                );
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [activeAccount?.id, activeAccount?.login, activeAccount?.accessAllInns, activeAccount?.customers?.length]);

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
                const { ok, data } = await postAuthRegisteredLogin({
                    email: activeAccount.login.trim().toLowerCase(),
                    password: activeAccount.password,
                    activity: "silent",
                });
                if (cancelled || !ok || !data?.ok || !data?.user) return;
                const user = data.user as Record<string, unknown>;
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

    const handleLogout = () => {
        setAccounts([]);
        setActiveAccountId(null);
        setActiveTab("cargo");
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("haulz.auth");
                window.localStorage.removeItem("haulz.accounts");
                window.localStorage.removeItem("haulz.activeAccountId");
            } catch {
                // игнорируем ошибки удаления
            }
        }
        setSearchText('');
    }
    
    // 404 для неизвестного path (не "/", "/admin", "/cms")
    if (typeof window !== "undefined" && shouldShowNotFound()) {
        return (
            <Suspense fallback={<div className="p-8 flex justify-center items-center min-h-[40vh]"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
                <NotFoundPage onGoHome={() => { window.location.href = "/"; }} />
            </Suspense>
        );
    }

    // Админка: постоянные ссылки /admin, /cms или ?tab=cms
    const isCmsStandalone =
        typeof window !== "undefined" &&
        (new URL(window.location.href).searchParams.get("tab") === "cms" ||
            /^\/(admin|cms)\/?$/i.test(window.location.pathname));
    if (isCmsStandalone) {
        return (
            <Suspense fallback={<div className="p-8 flex justify-center items-center min-h-[40vh]"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
                <CMSStandalonePage />
            </Suspense>
        );
    }

    if (!auth) {
        return <LoginScreen />;
    }

    if (isWbOnlyUser) {
        return (
            <AppNavigationProvider setSearchText={setSearchText} useServiceRequest={false}>
            <WbOnlyAppLayout
                desktopExpanded={desktopExpanded}
                onLogout={handleLogout}
                saasShellClassName={profileSaasShellActive ? "profile-saas-shell" : ""}
            >
                <AppRuntimeProvider
                    value={{
                        useServiceRequest: false,
                        searchText,
                        activeInn: activeAccount?.activeCustomerInn ?? auth?.inn ?? "",
                        activeCustomerName: stripOoo(activeAccount?.customer ?? ""),
                        showCustomerColumn,
                    }}
                >
                    <AppMainContent
                        showDashboard={false}
                        useServiceRequest={false}
                        setIsOfferOpen={setIsOfferOpen}
                        setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                        openSecretPinModal={openSecretPinModal}
                        CargoDetailsModal={CargoDetailsModal}
                        CargoPageComponent={CargoPage}
                        DashboardPageComponent={DashboardPage}
                        ProfilePageComponent={ProfilePage}
                        DocumentsPageComponent={DocumentsPage}
                        profileSaasShellActive={profileSaasShellActive}
                    />
                </AppRuntimeProvider>
            </WbOnlyAppLayout>
            </AppNavigationProvider>
        );
    }

    return (
        <AppNavigationProvider setSearchText={setSearchText} useServiceRequest={useServiceRequest}>
        <>
            <Container className={`app-container${profileSaasShellActive ? " profile-saas-shell" : ""}${showCustomerColumn ? "" : " app-hide-customer-column"}`}>
            <AppHeader
                searchText={searchText}
                setSearchText={setSearchText}
                useServiceRequest={useServiceRequest}
                setUseServiceRequest={setUseServiceRequest}
                serviceModeUnlocked={serviceModeUnlocked}
                serviceRefreshSpinning={serviceRefreshSpinning}
                setServiceRefreshSpinning={setServiceRefreshSpinning}
                onLogout={handleLogout}
            />
            <div className={`app-main${desktopExpanded ? " app-main-wide" : ""}`}>
                <div className="w-full">
                    <AppRuntimeProvider
                        value={{
                            useServiceRequest,
                            searchText,
                            activeInn: activeAccount?.activeCustomerInn ?? auth?.inn ?? "",
                            activeCustomerName: stripOoo(activeAccount?.customer ?? ""),
                            showCustomerColumn,
                        }}
                    >
                        <AppMainContent
                            showDashboard={showDashboard}
                            useServiceRequest={useServiceRequest}
                            setIsOfferOpen={setIsOfferOpen}
                            setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                            openSecretPinModal={openSecretPinModal}
                        CargoDetailsModal={CargoDetailsModal}
                        CargoPageComponent={CargoPage}
                        DashboardPageComponent={DashboardPage}
                        ProfilePageComponent={ProfilePage}
                        DocumentsPageComponent={DocumentsPage}
                        profileSaasShellActive={profileSaasShellActive}
                    />
                </AppRuntimeProvider>
            </div>
            </div>
            <AppTabBar showDashboard={showDashboard} />

            <AppShellModals
                authLogin={auth?.login}
                legalCompliance={legalCompliance}
                isOfferOpen={isOfferOpen}
                setIsOfferOpen={setIsOfferOpen}
                isPersonalConsentOpen={isPersonalConsentOpen}
                setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                showPinModal={showPinModal}
                setShowPinModal={setShowPinModal}
                pinCode={pinCode}
                setPinCode={setPinCode}
                pinError={pinError}
                setPinError={setPinError}
                onPinSubmit={handlePinSubmit}
                isChatOpen={isChatOpen}
                setIsChatOpen={setIsChatOpen}
            />
            </Container>
        </>
        </AppNavigationProvider>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppShellProvider>
                <AppRoot />
            </AppShellProvider>
        </AuthProvider>
    );
}
