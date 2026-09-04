import React, { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Container } from "@maxhub/max-ui";
import { Capacitor } from "@capacitor/core";
import { AppHeader } from "./AppHeader";
import { AppTabBar } from "./AppTabBar";
import { AppShellModals } from "./AppShellModals";
import { AppMainContent } from "./AppMainContent";
import { AppRuntimeProvider } from "../contexts/AppRuntimeContext";
import { DateFilterProvider } from "../contexts/DateFilterContext";
import { useAuth } from "../contexts/AuthContext";
import { useActiveCustomerInnSync } from "../hooks/useActiveCustomerInnSync";
import { usePushSelectedInnSync } from "../hooks/usePushSelectedInnSync";
import { resolveAccountActiveInn } from "../lib/accountCustomer";
import { useAppShell } from "../contexts/AppShellContext";
import { stripOoo } from "../lib/formatUtils";
import { dispatchPullRefresh } from "../lib/pullRefreshEvents";
import { useNativePullToRefresh } from "../hooks/useNativePullToRefresh";
import type { useLegalCompliance } from "../hooks/useLegalCompliance";
import type { FormEvent } from "react";

type LegalCompliance = ReturnType<typeof useLegalCompliance>;

type Props = {
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  useServiceRequest: boolean;
  setUseServiceRequest: React.Dispatch<React.SetStateAction<boolean>>;
  serviceModeUnlocked: boolean;
  showDashboard: boolean;
  profileSaasShellActive: boolean;
  showCustomerColumn: boolean;
  legalCompliance: LegalCompliance;
  isOfferOpen: boolean;
  setIsOfferOpen: (value: boolean) => void;
  isPersonalConsentOpen: boolean;
  setIsPersonalConsentOpen: (value: boolean) => void;
  showPinModal: boolean;
  setShowPinModal: (value: boolean) => void;
  pinCode: string;
  setPinCode: (value: string) => void;
  pinError: boolean;
  setPinError: (value: boolean) => void;
  onPinSubmit: (e?: FormEvent) => void;
  openSecretPinModal: () => void;
  onLogout: () => void;
};

export function AppAuthenticatedLayout({
  searchText,
  setSearchText,
  useServiceRequest,
  setUseServiceRequest,
  serviceModeUnlocked,
  showDashboard,
  profileSaasShellActive,
  showCustomerColumn,
  legalCompliance,
  isOfferOpen,
  setIsOfferOpen,
  isPersonalConsentOpen,
  setIsPersonalConsentOpen,
  showPinModal,
  setShowPinModal,
  pinCode,
  setPinCode,
  pinError,
  setPinError,
  onPinSubmit,
  openSecretPinModal,
  onLogout,
}: Props) {
  const { auth, activeAccount } = useAuth();
  const { desktopExpanded } = useAppShell();
  const appMainRef = useRef<HTMLDivElement>(null);
  const nativePullRefreshEnabled = Capacitor.isNativePlatform();

  const handlePullRefresh = useCallback(async () => {
    dispatchPullRefresh();
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }, []);

  const { pullDistance, refreshing: pullRefreshing } = useNativePullToRefresh(
    appMainRef,
    handlePullRefresh,
    nativePullRefreshEnabled,
  );

  useEffect(() => {
    if (!nativePullRefreshEnabled) return;
    const el = appMainRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [nativePullRefreshEnabled, showDashboard, useServiceRequest]);

  useActiveCustomerInnSync();
  usePushSelectedInnSync(useServiceRequest);

  return (
    <Container
      className={`app-container${profileSaasShellActive ? " profile-saas-shell" : ""}${useServiceRequest ? " app-service-mode" : ""}${showCustomerColumn ? "" : " app-hide-customer-column"}`}
    >
      <AppHeader
        searchText={searchText}
        setSearchText={setSearchText}
        useServiceRequest={useServiceRequest}
        setUseServiceRequest={setUseServiceRequest}
        serviceModeUnlocked={serviceModeUnlocked}
        onLogout={onLogout}
      />
      <div
        ref={appMainRef}
        className={`app-main${desktopExpanded ? " app-main-wide" : ""}${nativePullRefreshEnabled ? " app-main--pull-refresh" : ""}`}
      >
        {nativePullRefreshEnabled ? (
          <div
            className="native-pull-refresh-indicator"
            style={{ height: `${Math.max(pullDistance, pullRefreshing ? 72 : 0)}px` }}
            aria-hidden={pullDistance <= 0 && !pullRefreshing}
          >
            <div className="native-pull-refresh-indicator__inner">
              <Loader2 className={`w-4 h-4${pullRefreshing ? " animate-spin" : ""}`} />
            </div>
          </div>
        ) : null}
        <div className="w-full">
          <DateFilterProvider>
            <AppRuntimeProvider
              value={{
                useServiceRequest,
                searchText,
                activeInn: resolveAccountActiveInn(activeAccount, auth),
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
                profileSaasShellActive={profileSaasShellActive}
              />
            </AppRuntimeProvider>
          </DateFilterProvider>
        </div>
      </div>
      <AppTabBar showDashboard={showDashboard} />
      <AppShellModals
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
        onPinSubmit={onPinSubmit}
      />
    </Container>
  );
}
