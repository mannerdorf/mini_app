import React, { Suspense, lazy } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Package } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { CargoDetailsModal } from "./modals/CargoDetailsModal";
import { CargoPage, DashboardPage, DocumentsPage, ProfilePage } from "../app/lazyPages";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import { useAppNavigation } from "../contexts/AppNavigationContext";
import { useAccountActions } from "../hooks/useAccountActions";
import { useSupportBotLinks } from "../hooks/useSupportBotLinks";
import { WB_TAB } from "../wb/appWb";
import type { Account, Tab } from "../types";
import { isChunkLoadError, reloadForStaleChunks } from "../lib/chunkLoadRecovery";

const ExpenseRequestsPage = lazy(() =>
  import("../pages/ExpenseRequestsPage").then((m) => ({ default: m.ExpenseRequestsPage })),
);
const WildberriesPage = lazy(() =>
  import("../pages/WildberriesPage").then((m) => ({ default: m.WildberriesPage })),
);

type Props = {
  showDashboard: boolean;
  useServiceRequest: boolean;
  setIsOfferOpen: (value: boolean) => void;
  setIsPersonalConsentOpen: (value: boolean) => void;
  openSecretPinModal: () => void;
  profileSaasShellActive: boolean;
};

function EmptyCargoState({
  accounts,
  activeAccountId,
  setSelectedAccountIds,
  setActiveAccountId,
  setActiveTab,
}: {
  accounts: Account[];
  activeAccountId: string | null;
  setSelectedAccountIds: (ids: string[]) => void;
  setActiveAccountId: (id: string) => void;
  setActiveTab: (tab: Tab) => void;
}) {
  return (
    <Flex direction="column" align="center" justify="center" style={{ minHeight: "40vh", padding: "2rem", textAlign: "center" }}>
      {accounts.length === 0 ? (
        <>
          <Package className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }} />
          <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Добавьте аккаунт, чтобы видеть перевозки
          </Typography.Body>
          <Button className="filter-button" type="button" onClick={() => setActiveTab("profile")}>
            Перейти в Профиль
          </Button>
        </>
      ) : (
        <>
          <Package className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }} />
          <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Выберите компанию для просмотра перевозок
          </Typography.Body>
          <Button
            className="filter-button"
            type="button"
            onClick={() => {
              const id = activeAccountId && accounts.some((a) => a.id === activeAccountId) ? activeAccountId : accounts[0]?.id;
              if (id) {
                setSelectedAccountIds([id]);
                setActiveAccountId(id);
              }
            }}
          >
            Показать перевозки
          </Button>
        </>
      )}
    </Flex>
  );
}

function SectionBoundary({ section, children }: { section: string; children: React.ReactNode }) {
  const docsDebugEnabled =
    section === "Документы" &&
    typeof window !== "undefined" &&
    (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("debug_docs") === "1") return true;
        return window.localStorage.getItem("haulz.debug.docs") === "1";
      } catch {
        return false;
      }
    })();
  return (
    <ErrorBoundary
      fallback={(err) => {
        if (isChunkLoadError(err)) {
          reloadForStaleChunks(`section:${section}`);
        }
        return (
        <div style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ marginBottom: "0.5rem" }}>Ошибка в разделе ({section}).</p>
          {isChunkLoadError(err) ? (
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              Вышло обновление приложения. Страница перезагрузится автоматически…
            </p>
          ) : err.message ? (
            <p style={{ fontSize: "0.85rem", color: "#b91c1c", marginBottom: "0.75rem", wordBreak: "break-word" }}>{err.message}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!reloadForStaleChunks(`section-manual:${section}`)) {
                window.location.reload();
              }
            }}
            style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            Обновить страницу
          </button>
          {docsDebugEnabled ? (
            <details style={{ marginTop: "0.75rem", textAlign: "left" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.8rem" }}>Debug details</summary>
              <pre
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.72rem",
                  lineHeight: 1.35,
                  color: "#7f1d1d",
                  background: "#fef2f2",
                  padding: "0.65rem",
                  borderRadius: "0.5rem",
                  maxHeight: "30vh",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {[
                  `name: ${err?.name || "Error"}`,
                  `message: ${err?.message || "-"}`,
                  `path: ${window.location.pathname}${window.location.search}`,
                  `userAgent: ${navigator.userAgent}`,
                  "",
                  "stack:",
                  err?.stack || "(empty)",
                ].join("\n")}
              </pre>
            </details>
          ) : null}
        </div>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export function AppMainContent({
  showDashboard,
  useServiceRequest,
  setIsOfferOpen,
  setIsPersonalConsentOpen,
  openSecretPinModal,
  profileSaasShellActive,
}: Props) {
  const {
    auth,
    selectedAuths,
    accounts,
    activeAccountId,
    activeAccount,
    setSelectedAccountIds,
    setActiveAccountId,
    updateActiveAccountCustomer,
  } = useAuth();
  const { activeTab, setActiveTab } = useAppShell();
  const {
    contextCargoNumber,
    setContextCargoNumber,
    aisOpenWithMmsi,
    setAisOpenWithMmsi,
    openCargoWithFilters,
    openCargoFromChat,
    openCargoInPlace,
    openInvoiceInPlace,
    openActInPlace,
    openClaimFromCargo,
    openDocumentsWithSection,
    openAisWithMmsi,
  } = useAppNavigation();
  const {
    handleSwitchAccount,
    handleAddAccount,
    handleRemoveAccount,
    handleUpdateAccount,
  } = useAccountActions();
  const { openTelegramBotWithAccount, openMaxBotWithAccount } = useSupportBotLinks();
  const openWildberries = () => setActiveTab(WB_TAB);

  return (
    <>
      {showDashboard && activeTab === "dashboard" && auth && (
        <SectionBoundary section="Дашборд">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <DashboardPage
            auth={auth}
            onClose={() => {}}
            onOpenCargoFilters={openCargoWithFilters}
            showSums={activeAccount?.financialAccess ?? true}
            useServiceRequest={useServiceRequest}
            hasAnalytics={true}
            hasDashboard={true}
            saasDashboardMotion={profileSaasShellActive}
            onOpenCargo={openCargoInPlace}
            onOpenInvoice={openInvoiceInPlace}
            onOpenDocumentsEdo={() => openDocumentsWithSection("ЭДО")}
            onOpenDocumentsInvoices={() => openDocumentsWithSection("Счета")}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {activeTab === "expense_requests" && auth && (
        <SectionBoundary section="Заявки на расходы">
          <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
            <ExpenseRequestsPage
              auth={auth}
              departmentName={activeAccount?.customer ?? "Моё подразделение"}
              saasAnalyticsShell={profileSaasShellActive}
            />
          </Suspense>
        </SectionBoundary>
      )}

      {activeTab === "wildberries" && auth && (
        <SectionBoundary section="Wildberries">
          <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
            <WildberriesPage
              auth={auth}
              canUpload={
                activeAccount?.permissions?.cms_access === true || activeAccount?.permissions?.wb_admin === true
              }
              saasAnalyticsShell={profileSaasShellActive}
            />
          </Suspense>
        </SectionBoundary>
      )}

      {activeTab === "docs" && auth && (
        <SectionBoundary section="Документы">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <DocumentsPage
            auth={auth}
            onOpenCargo={openCargoInPlace}
            onOpenAisWithMmsi={openAisWithMmsi}
            onOpenChat={undefined}
            permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions : undefined}
            showSums={activeAccount?.financialAccess ?? true}
            hasAnalytics={activeAccount?.permissions?.analytics === true}
            isSuperAdmin={activeAccount?.isSuperAdmin === true}
            documentsServiceSaasUi={true}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {(showDashboard || activeTab === "cargo") && activeTab === "cargo" && (selectedAuths.length > 0 || (useServiceRequest && !!auth)) && (
        <SectionBoundary section="Грузы">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <CargoPage
            auths={selectedAuths.length > 0 ? selectedAuths : (auth ? [auth] : [])}
            cargoServiceSaasUi={true}
            onOpenChat={undefined}
            onOpenClaim={openClaimFromCargo}
            onCustomerDetected={updateActiveAccountCustomer}
            contextCargoNumber={contextCargoNumber}
            onClearContextCargo={() => setContextCargoNumber(null)}
            roleCustomer={
              showDashboard
                ? (activeAccount?.isRegisteredUser ? true : (activeAccount?.roleCustomer ?? true))
                : (activeAccount?.roleCustomer ?? true)
            }
            roleSender={false}
            roleReceiver={false}
            useServiceRequest={useServiceRequest}
            showSums={activeAccount?.financialAccess ?? true}
            onOpenInvoice={openInvoiceInPlace}
            onOpenAct={openActInPlace}
            CargoDetailsModal={CargoDetailsModal}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {activeTab === "cargo" && selectedAuths.length === 0 && !(useServiceRequest && auth) && (
        <SectionBoundary section="Грузы">
        <EmptyCargoState
          accounts={accounts}
          activeAccountId={activeAccountId}
          setSelectedAccountIds={setSelectedAccountIds}
          setActiveAccountId={setActiveAccountId}
          setActiveTab={setActiveTab}
        />
        </SectionBoundary>
      )}

      {showDashboard && activeTab === "profile" && (
        <SectionBoundary section="Профиль">
        <div className="w-full">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <ProfilePage
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onOpenOffer={() => setIsOfferOpen(true)}
            onOpenPersonalConsent={() => setIsPersonalConsentOpen(true)}
            onOpenNotifications={openSecretPinModal}
            onOpenCargo={openCargoFromChat}
            onOpenDocumentsWithSection={openDocumentsWithSection}
            aisOpenWithMmsi={aisOpenWithMmsi}
            setAisOpenWithMmsi={setAisOpenWithMmsi}
            onOpenTelegramBot={openTelegramBotWithAccount}
            onOpenMaxBot={openMaxBotWithAccount}
            onUpdateAccount={handleUpdateAccount}
            onOpenWildberries={openWildberries}
            profileSaasShellActive={profileSaasShellActive}
          />
        </Suspense>
        </div>
        </SectionBoundary>
      )}

      {!showDashboard && (activeTab === "dashboard" || activeTab === "home") && auth && (
        <SectionBoundary section="Дашборд">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <DashboardPage
            auth={auth}
            onClose={() => {}}
            onOpenCargoFilters={openCargoWithFilters}
            showSums={activeAccount?.financialAccess ?? true}
            useServiceRequest={useServiceRequest}
            hasAnalytics={activeAccount?.permissions?.analytics === true}
            hasDashboard={true}
            saasDashboardMotion={profileSaasShellActive}
            onOpenCargo={openCargoInPlace}
            onOpenInvoice={openInvoiceInPlace}
            onOpenDocumentsEdo={() => openDocumentsWithSection("ЭДО")}
            onOpenDocumentsInvoices={() => openDocumentsWithSection("Счета")}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {!showDashboard && activeTab === "profile" && (
        <SectionBoundary section="Профиль">
        <div className="w-full">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <ProfilePage
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onOpenOffer={() => setIsOfferOpen(true)}
            onOpenPersonalConsent={() => setIsPersonalConsentOpen(true)}
            onOpenNotifications={openSecretPinModal}
            onOpenCargo={openCargoFromChat}
            onOpenDocumentsWithSection={openDocumentsWithSection}
            aisOpenWithMmsi={aisOpenWithMmsi}
            setAisOpenWithMmsi={setAisOpenWithMmsi}
            onOpenTelegramBot={openTelegramBotWithAccount}
            onOpenMaxBot={openMaxBotWithAccount}
            onUpdateAccount={handleUpdateAccount}
            onOpenWildberries={openWildberries}
            profileSaasShellActive={profileSaasShellActive}
          />
        </Suspense>
        </div>
        </SectionBoundary>
      )}
    </>
  );
}

