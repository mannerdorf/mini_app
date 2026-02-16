import { useEffect, useMemo } from "react";
import {
  usePerevozkiMultiAccounts,
  usePrevPeriodPerevozki,
} from "../hooks/useApi";
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
    if (!useServiceRequest) return;
    const handler = () => void mutatePerevozki(undefined, { revalidate: true });
    window.addEventListener("haulz-service-refresh", handler);
    return () => window.removeEventListener("haulz-service-refresh", handler);
  }, [useServiceRequest, mutatePerevozki]);

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
