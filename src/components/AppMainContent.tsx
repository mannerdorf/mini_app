import React, { Suspense } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Package } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ExpenseRequestsPage } from "../pages/ExpenseRequestsPage";
import { WildberriesPage } from "../pages/WildberriesPage";
import type { Account, AuthData, Tab } from "../types";

type Props = {
  showDashboard: boolean;
  activeTab: Tab;
  auth: AuthData | null;
  selectedAuths: AuthData[];
  accounts: Account[];
  activeAccountId: string | null;
  activeAccount: Account | null;
  contextCargoNumber: string | null;
  useServiceRequest: boolean;
  setContextCargoNumber: (value: string | null) => void;
  setActiveTab: (tab: Tab) => void;
  setSelectedAccountIds: (ids: string[]) => void;
  setActiveAccountId: (id: string) => void;
  updateActiveAccountCustomer: (customer: string) => void;
  openCargoWithFilters: (filters: { statuses?: string[]; customer?: string }) => void;
  openCargoFromChat: (cargoNumber: string) => void;
  openCargoFromDocuments: (cargoNumber: string) => void;
  openClaimFromCargo: (cargoNumber: string) => void;
  openDocumentsWithSection: (section: string) => void;
  openAisWithMmsi: (mmsi: string) => void;
  aisOpenWithMmsi: string | null;
  setAisOpenWithMmsi: (value: string | null) => void;
  openTelegramBotWithAccount: () => Promise<void>;
  openWildberries: () => void;
  handleSwitchAccount: (accountId: string) => void;
  handleAddAccount: (account: Account) => Promise<void>;
  handleRemoveAccount: (accountId: string) => void;
  handleUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
  setIsOfferOpen: (value: boolean) => void;
  setIsPersonalConsentOpen: (value: boolean) => void;
  openSecretPinModal: () => void;
  CargoDetailsModal: React.ComponentType<any>;
  CargoPageComponent: React.ComponentType<any>;
  DashboardPageComponent: React.ComponentType<any>;
  ProfilePageComponent: React.ComponentType<any>;
  DocumentsPageComponent: React.ComponentType<any>;
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
  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ marginBottom: "0.5rem" }}>Ошибка в разделе ({section}).</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Обновить страницу
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function AppMainContent({
  showDashboard,
  activeTab,
  auth,
  selectedAuths,
  accounts,
  activeAccountId,
  activeAccount,
  contextCargoNumber,
  useServiceRequest,
  setContextCargoNumber,
  setActiveTab,
  setSelectedAccountIds,
  setActiveAccountId,
  updateActiveAccountCustomer,
  openCargoWithFilters,
  openCargoFromChat,
  openCargoFromDocuments,
  openClaimFromCargo,
  openDocumentsWithSection,
  openAisWithMmsi,
  aisOpenWithMmsi,
  setAisOpenWithMmsi,
  openTelegramBotWithAccount,
  openWildberries,
  handleSwitchAccount,
  handleAddAccount,
  handleRemoveAccount,
  handleUpdateAccount,
  setIsOfferOpen,
  setIsPersonalConsentOpen,
  openSecretPinModal,
  CargoDetailsModal,
  CargoPageComponent,
  DashboardPageComponent,
  ProfilePageComponent,
  DocumentsPageComponent,
  profileSaasShellActive,
}: Props) {
  const CargoPage = CargoPageComponent;
  const DashboardPage = DashboardPageComponent;
  const ProfilePage = ProfilePageComponent;
  const DocumentsPage = DocumentsPageComponent;
  const canAccessHaulzDispatch =
    activeAccount?.permissions?.haulz === true || activeAccount?.isSuperAdmin === true;

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
            canAccessHaulzDispatch={canAccessHaulzDispatch}
            onOpenCargo={openCargoFromChat}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {activeTab === "expense_requests" && auth && (
        <SectionBoundary section="Заявки на расходы">
          <ExpenseRequestsPage
            auth={auth}
            departmentName={activeAccount?.customer ?? "Моё подразделение"}
          />
        </SectionBoundary>
      )}

      {activeTab === "wildberries" && auth && (
        <SectionBoundary section="Wildberries">
          <WildberriesPage
            auth={auth}
            canUpload={
              activeAccount?.permissions?.cms_access === true || activeAccount?.permissions?.wb_admin === true
            }
          />
        </SectionBoundary>
      )}

      {activeTab === "docs" && auth && (
        <SectionBoundary section="Документы">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <DocumentsPage
            auth={auth}
            onOpenCargo={openCargoFromDocuments}
            onOpenAisWithMmsi={openAisWithMmsi}
            onOpenChat={undefined}
            permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions : undefined}
            showSums={activeAccount?.financialAccess ?? true}
            isSuperAdmin={activeAccount?.isSuperAdmin === true}
          />
        </Suspense>
        </SectionBoundary>
      )}

      {(showDashboard || activeTab === "cargo") && activeTab === "cargo" && (selectedAuths.length > 0 || (useServiceRequest && !!auth)) && (
        <SectionBoundary section="Грузы">
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <CargoPage
            auths={selectedAuths.length > 0 ? selectedAuths : (auth ? [auth] : [])}
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
            roleSender={activeAccount?.roleSender ?? true}
            roleReceiver={activeAccount?.roleReceiver ?? true}
            showSums={activeAccount?.financialAccess ?? true}
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
            onOpenMaxBot={undefined}
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
            canAccessHaulzDispatch={canAccessHaulzDispatch}
            onOpenCargo={openCargoFromChat}
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
            onOpenMaxBot={undefined}
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

