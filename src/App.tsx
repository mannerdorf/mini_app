import React, { useEffect, useLayoutEffect, useState, useMemo, Suspense } from "react";
import { Loader2 } from "lucide-react";
import "./styles.css";
import { AppMainContent } from "./components/AppMainContent";
import { AppAuthenticatedLayout } from "./components/AppAuthenticatedLayout";
import { CMSStandalonePage, GuestAuthShell, NotFoundPage } from "./app/lazyPages";
import { applyClientPlatformToDocument } from "./lib/clientPlatform";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShellProvider, useAppShell } from "./contexts/AppShellContext";
import { AppNavigationProvider } from "./contexts/AppNavigationContext";
import { shouldShowNotFound } from "./lib/notFoundRoute";
import { isWbOnlyAccount, WbOnlyAppLayout } from "./wb/appWb";
import { isRedReturnsOnlyAccount, RED_RETURNS_LABEL, syncRedReturnsUrl } from "./features/redReturns/appRedReturns";
import { HaulzReturnsPage } from "./pages/HaulzReturnsPage";
import { useLegalCompliance } from "./hooks/useLegalCompliance";
import { useShowCustomerColumn } from "./hooks/useShowCustomerColumn";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { useRegisteredAccountSync } from "./hooks/useRegisteredAccountSync";
import { useSecretDashboard } from "./hooks/useSecretDashboard";
import { useTelegramWebAppInit } from "./hooks/useTelegramWebAppInit";
import { useAppLogout } from "./hooks/useAppLogout";
import { useTwoFaSettingsSync } from "./hooks/useTwoFaSettingsSync";
import { stripOoo } from "./lib/formatUtils";
import { resolveAccountActiveInn } from "./lib/accountCustomer";
import { isCapacitorAndroidApp } from "./lib/androidAppUpdate";
import { isNativePushEnvironment } from "./lib/androidPushNotifications";
import { useAndroidAppUpdate } from "./hooks/useAndroidAppUpdate";
import { AndroidUpdateBanner } from "./components/AndroidUpdateBanner";

function AppRoot() {
    const {
        auth,
        activeAccount,
    } = useAuth();
    const { setTheme, desktopExpanded } = useAppShell();

    useLayoutEffect(() => {
        if (typeof document === "undefined") return;
        const isAdminRoute =
            new URL(window.location.href).searchParams.get("tab") === "cms" ||
            /^\/(admin|cms)\/?$/i.test(window.location.pathname);
        if (isAdminRoute) {
            document.documentElement.classList.remove("guest-mode", "dark-mode");
            document.documentElement.classList.add("light-mode");
            document.body.classList.remove("guest-mode", "dark-mode");
            document.body.classList.add("light-mode");
            setTheme("light");
            return;
        }
        if (!auth) {
            document.documentElement.classList.add("guest-mode", "light-mode");
            document.documentElement.classList.remove("dark-mode");
            document.body.classList.add("guest-mode", "light-mode");
            document.body.classList.remove("dark-mode");
            setTheme("light");
        }
    }, [auth, setTheme]);

    useEffect(() => {
        applyClientPlatformToDocument();
    }, []);

    useTelegramWebAppInit(setTheme);

    const [useServiceRequest, setUseServiceRequest] = useState(false);
    const [serviceRefreshSpinning, setServiceRefreshSpinning] = useState(false);

    const legalCompliance = useLegalCompliance(activeAccount);

    const showCustomerColumnBase = useShowCustomerColumn(activeAccount, useServiceRequest);
    const isMobileLayout = useMobileLayout();
    /** На телефоне столбец «Заказчик» только в служебном режиме; на десктопе — как раньше (несколько компаний). */
    const showCustomerColumn = showCustomerColumnBase && (!isMobileLayout || useServiceRequest);

    /** Оболочка HAULZ Analytics (CSS-токены, motion на главных экранах) — для всех пользователей. */
    const profileSaasShellActive = true;

    // Режим сквозной выборки без жёсткой привязки к ИНН:
    // переключатель доступен только тем, у кого в админке включён «Служебный режим» (service_mode).
    const serviceModeUnlocked = useMemo(() => {
        return !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;
    }, [activeAccount?.isRegisteredUser, activeAccount?.permissions?.service_mode]);
    const isWbOnlyUser = useMemo(() => isWbOnlyAccount(activeAccount), [activeAccount]);
    const isRedReturnsOnlyUser = useMemo(() => isRedReturnsOnlyAccount(activeAccount), [activeAccount]);
    const isNativeAndroid = useMemo(() => isCapacitorAndroidApp(), []);
    const isNativePush = useMemo(() => isNativePushEnvironment(), []);
    const androidUpdate = useAndroidAppUpdate(!!auth && isNativeAndroid);
    const [androidUpdateDismissed, setAndroidUpdateDismissed] = useState(false);
    useEffect(() => {
        if (!serviceModeUnlocked && useServiceRequest) {
            setUseServiceRequest(false);
        }
    }, [serviceModeUnlocked, useServiceRequest]);
    useTwoFaSettingsSync();
    useEffect(() => {
        const login = activeAccount?.login?.trim().toLowerCase();
        if (!auth || !login || !isNativePush) return;
        void import("./lib/androidPushNotifications").then(({ syncNativePushNotifications }) =>
            syncNativePushNotifications(login),
        );
    }, [auth, activeAccount?.login, isNativePush]);
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
                } else if (url.searchParams.get("newOrder") === "1") {
                    try {
                        window.localStorage.setItem("haulz.docs.section", "Заявки");
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
    useRegisteredAccountSync(isWbOnlyUser, isRedReturnsOnlyUser);

    useEffect(() => {
        if (isRedReturnsOnlyUser) syncRedReturnsUrl();
    }, [isRedReturnsOnlyUser]);

    const handleLogout = useAppLogout(setSearchText);
    
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
        return (
            <Suspense fallback={<div className="guest-shell flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-haulz-brand" /></div>}>
                <GuestAuthShell />
            </Suspense>
        );
    }

    if (isRedReturnsOnlyUser) {
        const redReturnsAuth = auth
            ? {
                login: auth.login,
                password: auth.password,
                ...(auth.inn ? { inn: auth.inn } : {}),
                ...(auth.isRegisteredUser ? { isRegisteredUser: true as const } : {}),
            }
            : null;
        return (
            <WbOnlyAppLayout
                desktopExpanded={desktopExpanded}
                onLogout={handleLogout}
                saasShellClassName={profileSaasShellActive ? "profile-saas-shell" : ""}
            >
                <HaulzReturnsPage auth={redReturnsAuth} pageTitle={RED_RETURNS_LABEL} />
            </WbOnlyAppLayout>
        );
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
                        activeInn: resolveAccountActiveInn(activeAccount, auth),
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
            {androidUpdate && !androidUpdateDismissed ? (
                <AndroidUpdateBanner manifest={androidUpdate} onDismiss={() => setAndroidUpdateDismissed(true)} />
            ) : null}
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
