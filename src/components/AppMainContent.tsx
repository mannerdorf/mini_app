import React, { Suspense } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Package } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { CargoPage } from "../pages/CargoPage";
import { Home2Page } from "../pages/Home2Page";
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
  updateActiveAccountCustomer: (data: { customerName?: string; customerInn?: string }) => void;
  openCargoWithFilters: (filters: { statuses?: string[]; customer?: string }) => void;
  openCargoFromChat: (cargoNumber: string) => void;
  handleSwitchAccount: (accountId: string) => void;
  handleAddAccount: (account: Account) => Promise<void>;
  handleRemoveAccount: (accountId: string) => void;
  handleUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
  setIsOfferOpen: (value: boolean) => void;
  setIsPersonalConsentOpen: (value: boolean) => void;
  openSecretPinModal: () => void;
  CargoDetailsModal: React.ComponentType<any>;
  DashboardPageComponent: React.ComponentType<any>;
  ProfilePageComponent: React.ComponentType<any>;
  DocumentsPageComponent: React.ComponentType<any>;
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
  handleSwitchAccount,
  handleAddAccount,
  handleRemoveAccount,
  handleUpdateAccount,
  setIsOfferOpen,
  setIsPersonalConsentOpen,
  openSecretPinModal,
  CargoDetailsModal,
  DashboardPageComponent,
  ProfilePageComponent,
  DocumentsPageComponent,
}: Props) {
  const DashboardPage = DashboardPageComponent;
  const ProfilePage = ProfilePageComponent;
  const DocumentsPage = DocumentsPageComponent;

  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ marginBottom: "0.5rem" }}>Ошибка в разделе (Грузы / Документы / Профиль).</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Обновить страницу
          </button>
        </div>
      }
    >
      {showDashboard && activeTab === "dashboard" && auth && (
        <DashboardPage
          auth={auth}
          onClose={() => {}}
          onOpenCargoFilters={openCargoWithFilters}
          showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : (activeAccount?.roleCustomer ?? true)}
          useServiceRequest={useServiceRequest}
          hasAnalytics={true}
        />
      )}

      {activeTab === "docs" && auth && (
        <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <DocumentsPage
            auth={auth}
            onOpenCargo={openCargoFromChat}
            onOpenChat={undefined}
            permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions : undefined}
            showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : true}
          />
        </Suspense>
      )}

      {activeTab === "home2" && <Home2Page useServiceRequest={useServiceRequest} />}

      {(showDashboard || activeTab === "cargo") && activeTab === "cargo" && selectedAuths.length > 0 && (
        <CargoPage
          auths={selectedAuths}
          onOpenChat={undefined}
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
          showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : true}
          CargoDetailsModal={CargoDetailsModal}
        />
      )}

      {activeTab === "cargo" && selectedAuths.length === 0 && (
        <EmptyCargoState
          accounts={accounts}
          activeAccountId={activeAccountId}
          setSelectedAccountIds={setSelectedAccountIds}
          setActiveAccountId={setActiveAccountId}
          setActiveTab={setActiveTab}
        />
      )}

      {showDashboard && activeTab === "profile" && (
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
          onOpenTelegramBot={undefined}
          onOpenMaxBot={undefined}
          onUpdateAccount={handleUpdateAccount}
        />
      )}

      {!showDashboard && (activeTab === "dashboard" || activeTab === "home") && auth && (
        <DashboardPage
          auth={auth}
          onClose={() => {}}
          onOpenCargoFilters={openCargoWithFilters}
          showSums={activeAccount?.roleCustomer ?? true}
          useServiceRequest={useServiceRequest}
          hasAnalytics={activeAccount?.permissions?.analytics === true}
          hasSupervisor={activeAccount?.permissions?.supervisor === true}
        />
      )}

      {!showDashboard && activeTab === "profile" && (
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
          onOpenTelegramBot={undefined}
          onOpenMaxBot={undefined}
          onUpdateAccount={handleUpdateAccount}
        />
      )}
    </ErrorBoundary>
  );
}

