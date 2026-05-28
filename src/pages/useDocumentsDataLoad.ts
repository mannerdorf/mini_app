import { useEffect } from "react";
import { useActs, useInvoices, useOrders, usePerevozki, useSendings } from "../hooks/useApi";
import { postServiceRefreshFrom1c, serviceRefreshKindsForDocumentsSection } from "../lib/serviceRefreshFrom1c";
import type { AuthData } from "../types";

type DocSectionKey = 'Счета' | 'ЭДО' | 'УПД' | 'Заявки' | 'Отправки' | 'Претензии' | 'Договоры' | 'Акты сверок' | 'Тарифы';

type Params = {
  auth: AuthData;
  activeInn: string;
  useServiceRequest: boolean;
  apiDateRange: { dateFrom: string; dateTo: string };
  perevozkiDateRange: { dateFrom: string; dateTo: string };
  docSection: DocSectionKey;
};

export function useDocumentsDataLoad(params: Params) {
  const { auth, activeInn, useServiceRequest, apiDateRange, perevozkiDateRange, docSection } = params;
  const loadInvoices = docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'УПД';
  const loadActs = docSection === 'УПД';
  const loadOrders = docSection === 'Заявки';
  const loadSendings = docSection === 'Отправки';
  const loadPerevozki = docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'УПД' || docSection === 'Отправки';

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
    enabled: loadInvoices,
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
    enabled: loadActs,
  });

  const {
    items: ordersItems,
    error: ordersError,
    loading: ordersLoading,
    mutate: mutateOrders,
  } = useOrders({
    auth,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    activeInn: activeInn || undefined,
    useServiceRequest,
    enabled: loadOrders,
  });
  const {
    items: sendingsItems,
    error: sendingsError,
    loading: sendingsLoading,
    mutate: mutateSendings,
  } = useSendings({
    auth,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    activeInn: activeInn || undefined,
    useServiceRequest,
    enabled: loadSendings,
  });

  const {
    items: perevozkiItems,
    loading: perevozkiLoading,
    mutate: mutatePerevozki,
  } = usePerevozki({
    auth,
    dateFrom: perevozkiDateRange.dateFrom,
    dateTo: perevozkiDateRange.dateTo,
    inn: activeInn || undefined,
    useServiceRequest: !!useServiceRequest,
    enabled: loadPerevozki,
  });

  useEffect(() => {
    if (!useServiceRequest) return;
    const handler = async () => {
      const kinds = serviceRefreshKindsForDocumentsSection(docSection);
      if (kinds.length > 0) {
        try {
          await postServiceRefreshFrom1c({
            auth,
            dateFrom: apiDateRange.dateFrom,
            dateTo: apiDateRange.dateTo,
            kinds,
          });
        } catch {
          /* best-effort for header refresh icon */
        }
      }
      if (loadInvoices) void mutateInvoices(undefined, { revalidate: true });
      if (loadPerevozki) void mutatePerevozki(undefined, { revalidate: true });
      if (loadActs) void mutateActs(undefined, { revalidate: true });
      if (loadOrders) void mutateOrders(undefined, { revalidate: true });
      if (loadSendings) void mutateSendings(undefined, { revalidate: true });
    };
    window.addEventListener("haulz-service-refresh", handler);
    return () => window.removeEventListener("haulz-service-refresh", handler);
  }, [
    useServiceRequest,
    auth,
    docSection,
    apiDateRange.dateFrom,
    apiDateRange.dateTo,
    loadInvoices,
    loadPerevozki,
    loadActs,
    loadOrders,
    loadSendings,
    mutateInvoices,
    mutatePerevozki,
    mutateActs,
    mutateOrders,
    mutateSendings,
  ]);

  return {
    items,
    error,
    loading,
    actsItems,
    actsError,
    actsLoading,
    ordersItems,
    ordersError,
    ordersLoading,
    sendingsItems,
    sendingsError,
    sendingsLoading,
    perevozkiItems,
    perevozkiLoading,
    mutateInvoices,
    mutatePerevozki,
    mutateActs,
    mutateOrders,
    mutateSendings,
  };
}

