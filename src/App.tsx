import React, { useEffect, useState, useMemo, Suspense } from "react";
import { Loader2 } from "lucide-react";
import "./styles.css";
import { AppMainContent } from "./components/AppMainContent";
import { AppAuthenticatedLayout } from "./components/AppAuthenticatedLayout";
import { LoginScreen } from "./components/LoginScreen";
import { applyClientPlatformToDocument } from "./lib/clientPlatform";
import { CMSStandalonePage, NotFoundPage } from "./app/lazyPages";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShellProvider, useAppShell } from "./contexts/AppShellContext";
import { AppNavigationProvider } from "./contexts/AppNavigationContext";
import { shouldShowNotFound } from "./lib/notFoundRoute";
import { isWbOnlyAccount, WbOnlyAppLayout } from "./wb/appWb";
import { isRedReturnsOnlyAccount, syncRedReturnsUrl } from "./features/redReturns/appRedReturns";
import { HaulzReturnsPage } from "./pages/HaulzReturnsPage";
import { useLegalCompliance } from "./hooks/useLegalCompliance";
import { useShowCustomerColumn } from "./hooks/useShowCustomerColumn";
import { useRegisteredAccountSync } from "./hooks/useRegisteredAccountSync";
import { useSecretDashboard } from "./hooks/useSecretDashboard";
import { useTelegramWebAppInit } from "./hooks/useTelegramWebAppInit";
import { useAppLogout } from "./hooks/useAppLogout";
import { useTwoFaSettingsSync } from "./hooks/useTwoFaSettingsSync";
import { stripOoo } from "./lib/formatUtils";

function AppRoot() {
    const {
        auth,
        activeAccount,
    } = useAuth();
    const { setTheme, desktopExpanded } = useAppShell();

    useEffect(() => {
        applyClientPlatformToDocument();
    }, []);

    useTelegramWebAppInit(setTheme);

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
    const isRedReturnsOnlyUser = useMemo(() => isRedReturnsOnlyAccount(activeAccount), [activeAccount]);
    useEffect(() => {
        if (!serviceModeUnlocked && useServiceRequest) {
            setUseServiceRequest(false);
        }
    }, [serviceModeUnlocked, useServiceRequest]);
    useTwoFaSettingsSync();
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
        return <LoginScreen />;
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
                <HaulzReturnsPage auth={redReturnsAuth} pageTitle="Красный возврат" />
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
