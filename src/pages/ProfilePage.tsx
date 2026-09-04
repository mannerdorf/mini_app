import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { Account, AuthData, ProfileView } from "../types";
import { CompaniesListPage } from "./CompaniesListPage";
import { CompaniesPage } from "./CompaniesPage";
import { AddCompanyByINNPage } from "./AddCompanyByINNPage";
import { AddCompanyByLoginPage } from "./AddCompanyByLoginPage";
import { TinyUrlTestPage } from "./TinyUrlTestPage";
import { AboutCompanyPage } from "./AboutCompanyPage";
import { NotificationsPage } from "./NotificationsPage";
import { AisStreamPage } from "./AisStreamPage";
import { ProfileTwoFactorSection } from "../components/profile/ProfileTwoFactorSection";
import { ProfileVoiceAssistantsSection } from "../components/profile/ProfileVoiceAssistantsSection";
import { ProfileFaqSection } from "../components/profile/ProfileFaqSection";
import { ProfileVersionSection } from "../components/profile/ProfileVersionSection";
import { ProfilePushHistorySection } from "../components/profile/ProfilePushHistorySection";
import { ProfileRolesSection } from "../components/profile/ProfileRolesSection";
import { ProfileHaulzSection } from "../components/profile/ProfileHaulzSection";
import { HaulzReturnsPage } from "./HaulzReturnsPage";
import { HaulzCalculatorPage } from "./HaulzCalculatorPage";
import { HaulzCalcRequestsPage } from "./HaulzCalcRequestsPage";
import { ProfileParcelScannerSection } from "../components/profile/ProfileParcelScannerSection";
import { ProfileHaulzRulerSection } from "../components/profile/ProfileHaulzRulerSection";
import { ProfileExpenseRequestsSection } from "../components/profile/ProfileExpenseRequestsSection";
import { ProfileApiKeysSection } from "../components/profile/ProfileApiKeysSection";
import {
  persistProfileNavigation,
  readStoredHaulzCalcBackView,
  readStoredHaulzCalcDraftId,
  readStoredProfileView,
} from "../lib/profileViewPersist";
import { isNativePushEnvironment } from "../lib/androidPushNotifications";
import { useAppShell } from "../contexts/AppShellContext";
import { usePullRefreshListener } from "../hooks/usePullRefreshListener";
import { useProfileEmployees, ProfileEmployeesSection, useDepartmentTimesheet, ProfileDepartmentTimesheetSection, useProfileAccounting, ProfileAccountingSection, useProfileMain, ProfileMainSection } from "../features/profile";

const HaulzSendingsAnalysisPage = lazy(() =>
  import("./HaulzSendingsAnalysisPage").then((m) => ({ default: m.HaulzSendingsAnalysisPage })),
);
const HaulzDeliveredWithoutAppPage = lazy(() =>
  import("./HaulzDeliveredWithoutAppPage").then((m) => ({ default: m.HaulzDeliveredWithoutAppPage })),
);
const HaulzCargoTimelinePage = lazy(() =>
  import("./HaulzCargoTimelinePage").then((m) => ({ default: m.HaulzCargoTimelinePage })),
);

function HaulzAnalyticsPageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "1.5rem 0", color: "var(--color-text-secondary)" }}>
      <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      Загрузка…
    </div>
  );
}

export function ProfilePage({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onAddAccount,
    onRemoveAccount,
    onOpenOffer,
    onOpenPersonalConsent,
    onOpenNotifications,
    onOpenCargo,
    onOpenDocumentsWithSection,
    aisOpenWithMmsi,
    setAisOpenWithMmsi,
    onOpenTelegramBot,
    onOpenMaxBot,
    onUpdateAccount,
    onOpenWildberries,
    profileSaasShellActive = false,
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onAddAccount: (login: string, password: string) => Promise<void>;
    onRemoveAccount: (accountId: string) => void;
    onOpenOffer: () => void;
    onOpenPersonalConsent: () => void;
    onOpenNotifications: () => void;
    onOpenCargo: (cargoNumber: string) => void;
    onOpenDocumentsWithSection?: (section: string) => void;
    aisOpenWithMmsi?: string | null;
    setAisOpenWithMmsi?: (value: string | null) => void;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onOpenWildberries?: () => void;
    /** Активна оболочка «мягкая панель» (суперадмин или право haulz). */
    profileSaasShellActive?: boolean;
}) {
    const { profileRootRequest, profileViewRequest, requestedProfileView } = useAppShell();
    const [currentView, setCurrentView] = useState<ProfileView>(() => readStoredProfileView());
    const [haulzCalcRestoreDraftId, setHaulzCalcRestoreDraftId] = useState<number | null>(() =>
      readStoredHaulzCalcDraftId(),
    );
    const [haulzCalcBackView, setHaulzCalcBackView] = useState<ProfileView>(() => readStoredHaulzCalcBackView());
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const profileEmployees = useProfileEmployees({
        activeAccount,
        fetchEnabled: currentView === "employees" || currentView === "haulz",
    });
    const departmentTimesheet = useDepartmentTimesheet({
        activeAccount,
        fetchEnabled: currentView === "departmentTimesheet",
    });
    const profileAccounting = useProfileAccounting({
        activeAccount,
        fetchEnabled: currentView === "accounting",
    });
    const profileMain = useProfileMain({
        activeAccount,
        fetchEnabled: currentView === "main",
    });

    const handleProfilePullRefresh = useCallback(async () => {
        if (currentView === "main") {
            await profileMain.reloadLegalStatus();
            return;
        }
        if (currentView === "employees" || currentView === "haulz") {
            await profileEmployees.fetchEmployeesAndPresets();
            return;
        }
        if (currentView === "departmentTimesheet") {
            await departmentTimesheet.fetchDepartmentTimesheet();
            return;
        }
        if (currentView === "accounting") {
            await profileAccounting.fetchAccountingRequests();
            if (profileAccounting.accountingSubsection === "sverki") {
                await profileAccounting.fetchSverkiRequests();
            }
            if (profileAccounting.accountingSubsection === "claims") {
                await profileAccounting.reloadAccountingClaims();
            }
        }
    }, [currentView, profileMain, profileEmployees, departmentTimesheet, profileAccounting]);

    usePullRefreshListener(handleProfilePullRefresh);

    useEffect(() => {
        if (aisOpenWithMmsi) {
            setCurrentView('ais');
        }
    }, [aisOpenWithMmsi]);

    useEffect(() => {
        persistProfileNavigation(currentView, haulzCalcBackView, haulzCalcRestoreDraftId);
    }, [currentView, haulzCalcBackView, haulzCalcRestoreDraftId]);

    useEffect(() => {
        if (profileRootRequest === 0) return;
        setHaulzCalcRestoreDraftId(null);
        setCurrentView("main");
    }, [profileRootRequest]);

    useEffect(() => {
        if (profileViewRequest === 0 || !requestedProfileView) return;
        setHaulzCalcRestoreDraftId(null);
        setCurrentView(requestedProfileView);
    }, [profileViewRequest, requestedProfileView]);
    useEffect(() => {
        const voiceUnlocked =
            activeAccount?.isRegisteredUser === true && activeAccount?.permissions?.service_mode === true;
        if (currentView === 'voiceAssistants' && !voiceUnlocked) {
            setCurrentView('main');
        }
    }, [currentView, activeAccount?.isRegisteredUser, activeAccount?.permissions?.service_mode]);

    useEffect(() => {
        if (currentView === "push" && !isNativePushEnvironment()) {
            setCurrentView("main");
        }
    }, [currentView]);

    useEffect(() => {
        if (
            (currentView === "haulzSendingsAnalysis" ||
                currentView === "haulzDeliveredWithoutApp" ||
                currentView === "haulzCargoTimeline") &&
            activeAccount?.permissions?.haulz !== true
        ) {
            setCurrentView("haulz");
        }
    }, [currentView, activeAccount?.permissions?.haulz]);

    useEffect(() => {
        if (currentView === "haulzSandbox" || currentView === "haulzSummary") {
            setCurrentView("haulz");
        }
    }, [currentView]);

    if (currentView === 'companies') {
        return <CompaniesListPage 
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={onSwitchAccount}
            onRemoveAccount={onRemoveAccount}
            onUpdateAccount={onUpdateAccount}
            onBack={() => setCurrentView('main')}
            onAddCompany={() => setCurrentView('addCompanyMethod')}
        />;
    }

    if (currentView === 'roles') {
        return (
            <ProfileRolesSection
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'apiKeys') {
        return <ProfileApiKeysSection activeAccount={activeAccount} onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'haulz') {
        return (
            <ProfileHaulzSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView("main")}
                navigateTo={(view) => {
                    if (view === "haulzCalculator") {
                        setHaulzCalcRestoreDraftId(null);
                        setHaulzCalcBackView("haulz");
                    }
                    if (view === "haulzCalcRequests") {
                        setHaulzCalcRestoreDraftId(null);
                    }
                    setCurrentView(view);
                }}
                onOpenDocumentsWithSection={onOpenDocumentsWithSection}
            />
        );
    }

    if (currentView === 'haulzReturns') {
        const auth: AuthData | null = activeAccount ? {
            login: activeAccount.login,
            password: activeAccount.password,
            inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
            ...(activeAccount.isRegisteredUser === true ? { isRegisteredUser: true } : {}),
        } : null;
        return (
            <HaulzReturnsPage auth={auth} onBack={() => setCurrentView("haulz")} />
        );
    }

    if (
        currentView === "haulzSendingsAnalysis" ||
        currentView === "haulzDeliveredWithoutApp" ||
        currentView === "haulzCargoTimeline"
    ) {
        if (!activeAccount || activeAccount.permissions?.haulz !== true) {
            return null;
        }
        const auth: AuthData = {
            login: activeAccount.login,
            password: activeAccount.password,
            inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
            ...(activeAccount.isRegisteredUser === true ? { isRegisteredUser: true } : {}),
        };
        const useServiceRequest = activeAccount.permissions?.service_mode === true;
        if (currentView === "haulzSendingsAnalysis") {
            return (
                <Suspense fallback={<HaulzAnalyticsPageLoader />}>
                    <HaulzSendingsAnalysisPage
                        auth={auth}
                        useServiceRequest={useServiceRequest}
                        onBack={() => setCurrentView("haulz")}
                    />
                </Suspense>
            );
        }
        if (currentView === "haulzCargoTimeline") {
            return (
                <Suspense fallback={<HaulzAnalyticsPageLoader />}>
                    <HaulzCargoTimelinePage
                        auth={auth}
                        useServiceRequest={useServiceRequest}
                        onBack={() => setCurrentView("haulz")}
                    />
                </Suspense>
            );
        }
        return (
            <Suspense fallback={<HaulzAnalyticsPageLoader />}>
                <HaulzDeliveredWithoutAppPage
                    auth={auth}
                    useServiceRequest={useServiceRequest}
                    onBack={() => setCurrentView("haulz")}
                />
            </Suspense>
        );
    }

    if (currentView === 'haulzCalcRequests') {
        const auth: AuthData | null = activeAccount ? {
            login: activeAccount.login,
            password: activeAccount.password,
            inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
            ...(activeAccount.isRegisteredUser === true ? { isRegisteredUser: true } : {}),
        } : null;
        if (!auth) {
            return (
                <div className="w-full">
                    <p>Нет авторизации</p>
                    <Button type="button" className="button-primary" onClick={() => setCurrentView("haulz")}>
                        Назад
                    </Button>
                </div>
            );
        }
        const calcManagerMode =
            activeAccount?.permissions?.haulz === true && activeAccount?.permissions?.supervisor === true;
        return (
            <HaulzCalcRequestsPage
                auth={auth}
                managerMode={calcManagerMode}
                onBack={() => setCurrentView("haulz")}
                onOpenCalculator={(draftId) => {
                    setHaulzCalcRestoreDraftId(draftId ?? null);
                    setHaulzCalcBackView("haulzCalcRequests");
                    setCurrentView("haulzCalculator");
                }}
            />
        );
    }

    if (currentView === 'haulzCalculator') {
        const auth: AuthData | null = activeAccount ? {
            login: activeAccount.login,
            password: activeAccount.password,
            inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
            ...(activeAccount.isRegisteredUser === true ? { isRegisteredUser: true } : {}),
        } : null;
        return (
            <HaulzCalculatorPage
                auth={auth}
                onBack={() => {
                    setHaulzCalcRestoreDraftId(null);
                    setCurrentView(haulzCalcBackView);
                }}
                restoreDraftId={haulzCalcRestoreDraftId}
                onDraftConsumed={() => setHaulzCalcRestoreDraftId(null)}
            />
        );
    }

    if (currentView === 'ais') {
        return (
            <AisStreamPage
                onBack={() => setCurrentView('haulz')}
                initialMmsi={aisOpenWithMmsi ?? undefined}
                onConsumedInitialMmsi={() => setAisOpenWithMmsi?.(null)}
            />
        );
    }

    if (currentView === 'parcelScanner') {
        return (
            <ProfileParcelScannerSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView("main")}
            />
        );
    }

    if (currentView === "haulzRuler") {
        if (!activeAccount || activeAccount.permissions?.haulz !== true) {
            return null;
        }
        return <ProfileHaulzRulerSection onBack={() => setCurrentView("haulz")} />;
    }

    if (currentView === 'expenseRequests') {
        return (
            <ProfileExpenseRequestsSection activeAccount={activeAccount} onBack={() => setCurrentView("haulz")} />
        );
    }

    if (currentView === 'accounting') {
        return (
            <ProfileAccountingSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView('haulz')}
                accounting={profileAccounting}
            />
        );
    }

    if (currentView === 'departmentTimesheet') {
        return (
            <ProfileDepartmentTimesheetSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView('haulz')}
                timesheet={departmentTimesheet}
            />
        );
    }

    if (currentView === 'employees') {
        return (
            <ProfileEmployeesSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView('main')}
                employees={profileEmployees}
            />
        );
    }

    if (currentView === 'addCompanyMethod') {
        return <CompaniesPage onBack={() => setCurrentView('companies')} onSelectMethod={(method) => {
            if (method === 'inn') {
                setCurrentView('addCompanyByINN');
            } else {
                setCurrentView('addCompanyByLogin');
            }
        }} />;
    }
    
    if (currentView === 'addCompanyByINN') {
        return <AddCompanyByINNPage 
            activeAccount={activeAccount}
            onBack={() => setCurrentView('addCompanyMethod')} 
            onSuccess={() => setCurrentView('companies')}
        />;
    }
    
    if (currentView === 'addCompanyByLogin') {
        return <AddCompanyByLoginPage 
            onBack={() => setCurrentView('addCompanyMethod')} 
            onAddAccount={onAddAccount}
            onSuccess={() => setCurrentView('companies')}
        />;
    }

    if (currentView === 'tinyurl-test') {
        return <TinyUrlTestPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'about') {
        return <AboutCompanyPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'voiceAssistants') {
        return (
            <ProfileVoiceAssistantsSection activeAccount={activeAccount} onBack={() => setCurrentView('main')} />
        );
    }

    if (currentView === 'notifications') {
        return (
            <NotificationsPage
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onOpenDeveloper={() => {}}
                onOpenTelegramBot={onOpenTelegramBot}
                onOpenMaxBot={undefined}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'push') {
        return (
            <ProfilePushHistorySection
                activeAccount={activeAccount}
                onBack={() => setCurrentView('main')}
            />
        );
    }

    if (currentView === 'faq') {
        return <ProfileFaqSection onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'version') {
        return <ProfileVersionSection onBack={() => setCurrentView('main')} />;
    }

    if (currentView === '2fa' && activeAccountId && activeAccount) {
        return (
            <ProfileTwoFactorSection
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onUpdateAccount={onUpdateAccount}
                onOpenTelegramBot={onOpenTelegramBot}
            />
        );
    }

    return (
        <ProfileMainSection
            activeAccount={activeAccount}
            activeAccountId={activeAccountId}
            profileSaasShellActive={profileSaasShellActive}
            onNavigate={setCurrentView}
            onOpenOffer={onOpenOffer}
            onOpenPersonalConsent={onOpenPersonalConsent}
            onUpdateAccount={onUpdateAccount}
            main={profileMain}
        />
    );
}
