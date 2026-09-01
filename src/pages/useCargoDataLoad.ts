import { useEffect, useMemo } from "react";
import {
  usePerevozkiMultiAccounts,
  usePrevPeriodPerevozki,
} from "../hooks/useApi";
import { postServiceRefreshFrom1c } from "../lib/serviceRefreshFrom1c";
import { HAULZ_PULL_REFRESH_EVENT } from "../lib/pullRefreshEvents";
import type { AuthData, CargoItem } from "../types";

type Params = {
  auths: AuthData[];
  apiDateRange: { dateFrom: string; dateTo: string };
  prevRange: { dateFrom: string; dateTo: string } | null;
  useServiceRequest: boolean;
  roleCustomer: boolean;
  roleSender: boolean;
  roleReceiver: boolean;
  onCustomerDetected?: (customer: string) => void;
};

export function useCargoDataLoad(params: Params) {
  const {
    auths,
    apiDateRange,
    prevRange,
    useServiceRequest,
    roleCustomer,
    roleSender,
    roleReceiver,
    onCustomerDetected,
  } = params;

  const primaryAuth = useMemo(() => (auths.length > 0 ? auths[0] : null), [auths]);

  const {
    items,
    error,
    loading,
    mutate: mutatePerevozki,
  } = usePerevozkiMultiAccounts({
    auths,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    useServiceRequest,
    roleCustomer,
    roleSender,
    roleReceiver,
  });

  const { items: prevPeriodItems, loading: prevPeriodLoading } = usePrevPeriodPerevozki({
    auth: primaryAuth,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    dateFromPrev: prevRange?.dateFrom ?? "",
    dateToPrev: prevRange?.dateTo ?? "",
    useServiceRequest: true,
    enabled: !!useServiceRequest && !!prevRange && !!primaryAuth,
  });

  useEffect(() => {
    const refreshFrom1c = async () => {
      if (!useServiceRequest || !primaryAuth) return;
      try {
        await postServiceRefreshFrom1c({
          auth: primaryAuth,
          dateFrom: apiDateRange.dateFrom,
          dateTo: apiDateRange.dateTo,
          kinds: ["perevozki"],
        });
      } catch {
        /* UI may show error from button; header refresh is best-effort */
      }
    };
    const revalidate = () => {
      void mutatePerevozki(undefined, { revalidate: true });
    };
    const onServiceRefresh = async () => {
      await refreshFrom1c();
      revalidate();
    };
    const onPullRefresh = async () => {
      if (useServiceRequest) {
        await refreshFrom1c();
      }
      revalidate();
    };
    window.addEventListener("haulz-service-refresh", onServiceRefresh);
    window.addEventListener(HAULZ_PULL_REFRESH_EVENT, onPullRefresh);
    return () => {
      window.removeEventListener("haulz-service-refresh", onServiceRefresh);
      window.removeEventListener(HAULZ_PULL_REFRESH_EVENT, onPullRefresh);
    };
  }, [useServiceRequest, primaryAuth, apiDateRange.dateFrom, apiDateRange.dateTo, mutatePerevozki]);

  useEffect(() => {
    const customerItem = items.find((item: CargoItem) => item.Customer);
    if (customerItem?.Customer && onCustomerDetected) {
      onCustomerDetected(customerItem.Customer);
    }
  }, [items, onCustomerDetected]);

  return {
    primaryAuth,
    items,
    error,
    loading,
    mutatePerevozki,
    prevPeriodItems,
    prevPeriodLoading,
  };
}
