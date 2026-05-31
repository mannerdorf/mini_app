import React, { useEffect, useState, useMemo, Suspense } from "react";
import { Loader2 } from "lucide-react";
import "./styles.css";
import { AppMainContent } from "./components/AppMainContent";
import { AppAuthenticatedLayout } from "./components/AppAuthenticatedLayout";
import { LoginScreen } from "./components/LoginScreen";
import { getWebApp, isMaxWebApp } from "./webApp";
import { applyClientPlatformToDocument } from "./lib/clientPlatform";
import { CMSStandalonePage, NotFoundPage } from "./app/lazyPages";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { AuthProvider, useAuth, normalizePermissions } from "./contexts/AuthContext";
import { AppShellProvider, useAppShell } from "./contexts/AppShellContext";
import { AppNavigationProvider } from "./contexts/AppNavigationContext";
import { shouldShowNotFound } from "./lib/notFoundRoute";
import { isWbOnlyAccount, WbOnlyAppLayout } from "./wb/appWb";
import { HAULZ_SPLASH_BACKGROUND } from "./constants/brand";
import { fetchTwoFaSettings } from "./api/client/twoFa";
import { useLegalCompliance } from "./hooks/useLegalCompliance";
import { useShowCustomerColumn } from "./hooks/useShowCustomerColumn";
import { useRegisteredAccountSync } from "./hooks/useRegisteredAccountSync";
import { useSecretDashboard } from "./hooks/useSecretDashboard";
import { stripOoo } from "./lib/formatUtils";

function AppRoot() {
    const {
        accounts,
        setAccounts,
        setActiveAccountId,
        auth,
        activeAccount,
    } = useAuth();
    const { setTheme, desktopExpanded, setActiveTab } = useAppShell();

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
    }, [activeAccount?.id, activeAccount?.login, setAccounts]);
    const {
        showDashboard,
        showPinModal,
        setShowPinModal,
        pinCode,
        setPinCode,
        pinError,
        setPinError,
        openSecretPinModal,
        handlePinSubmit,
    } = useSecretDashboard();
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
    useRegisteredAccountSync(isWbOnlyUser);

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
                        profileSaasShellActive={profileSaasShellActive}
                    />
                </AppRuntimeProvider>
            </WbOnlyAppLayout>
            </AppNavigationProvider>
        );
    }

    return (
        <AppNavigationProvider setSearchText={setSearchText} useServiceRequest={useServiceRequest}>
            <AppAuthenticatedLayout
                searchText={searchText}
                setSearchText={setSearchText}
                useServiceRequest={useServiceRequest}
                setUseServiceRequest={setUseServiceRequest}
                serviceModeUnlocked={serviceModeUnlocked}
                serviceRefreshSpinning={serviceRefreshSpinning}
                setServiceRefreshSpinning={setServiceRefreshSpinning}
                showDashboard={showDashboard}
                profileSaasShellActive={profileSaasShellActive}
                showCustomerColumn={showCustomerColumn}
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
                openSecretPinModal={openSecretPinModal}
                onLogout={handleLogout}
            />
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
