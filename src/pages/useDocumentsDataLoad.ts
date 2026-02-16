import { useEffect } from "react";
import { useActs, useInvoices, usePerevozki } from "../hooks/useApi";
import type { AuthData } from "../types";

type Params = {
  auth: AuthData;
  activeInn: string;
  useServiceRequest: boolean;
  apiDateRange: { dateFrom: string; dateTo: string };
  perevozkiDateRange: { dateFrom: string; dateTo: string };
};

export function useDocumentsDataLoad(params: Params) {
  const { auth, activeInn, useServiceRequest, apiDateRange, perevozkiDateRange } = params;

  const {
    items,
    error,
    loading,
    mutate: mutateInvoices,
  } = useInvoices({
    auth,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    activeInn: activeInn || undefined,
    useServiceRequest,
  });

  const {
    items: actsItems,
    error: actsError,
    loading: actsLoading,
    mutate: mutateActs,
  } = useActs({
    auth,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    activeInn: activeInn || undefined,
    useServiceRequest,
  });

  const {
    items: perevozkiItems,
    loading: perevozkiLoading,
    mutate: mutatePerevozki,
  } = usePerevozki({
    auth,
    dateFrom: perevozkiDateRange.dateFrom,
    dateTo: perevozkiDateRange.dateTo,
    useServiceRequest: !!useServiceRequest,
  });

  useEffect(() => {
    if (!useServiceRequest) return;
    const handler = () => {
      void mutateInvoices(undefined, { revalidate: true });
      void mutatePerevozki(undefined, { revalidate: true });
      void mutateActs(undefined, { revalidate: true });
    };
    window.addEventListener("haulz-service-refresh", handler);
    return () => window.removeEventListener("haulz-service-refresh", handler);
  }, [useServiceRequest, mutateInvoices, mutatePerevozki, mutateActs]);

  return {
    items,
    error,
    loading,
    actsItems,
    actsError,
    actsLoading,
    perevozkiItems,
    perevozkiLoading,
    mutateInvoices,
    mutatePerevozki,
    mutateActs,
  };
}

