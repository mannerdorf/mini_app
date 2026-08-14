import { useDocumentsToolbarDropdowns } from "../features/documents/hooks/useDocumentsToolbarDropdowns";
import { buildDocumentsPageToolbarProps } from "./useDocumentsPageToolbarProps";
import type { AuthData } from "../types";
import type { useDocumentsCatalogs } from "../features/documents/hooks/useDocumentsCatalogs";
import type { useDocumentsPageFilters } from "../features/documents/hooks/useDocumentsPageFilters";
import type { usePersistedDateFilter } from "../features/listWorkspace";

type Catalogs = ReturnType<typeof useDocumentsCatalogs>;
type Filters = ReturnType<typeof useDocumentsPageFilters>;
type DateFilterState = ReturnType<typeof usePersistedDateFilter>;

type Params = {
  filters: Filters;
  catalogs: Catalogs;
  uniqueCustomers: string[];
  uniqueEdoStatuses: string[];
  sendingsTransportOptions: string[];
  apiDateRange: { dateFrom: string; dateTo: string };
  dateFilterState: DateFilterState;
  effectiveServiceMode: boolean;
  loading: boolean;
  error: string | null;
  actsLoading: boolean;
  actsError: string | null;
  showSums: boolean;
  documentsServiceSaasUi: boolean;
  tableModeFlatDirect: boolean;
  docsMotionEnabled: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  activeCustomerName?: string;
  onNewOrder: () => void;
  onOpenClaimsCreate: () => void;
  onOpenSverkiOrder: () => void;
  sverkiOrderDisabled: boolean;
};

export function useDocumentsToolbarWiring({
  filters,
  catalogs,
  uniqueCustomers,
  uniqueEdoStatuses,
  sendingsTransportOptions,
  apiDateRange,
  dateFilterState,
  effectiveServiceMode,
  loading,
  error,
  actsLoading,
  actsError,
  showSums,
  documentsServiceSaasUi,
  tableModeFlatDirect,
  docsMotionEnabled,
  auth,
  effectiveActiveInn,
  activeCustomerName,
  onNewOrder,
  onOpenClaimsCreate,
  onOpenSverkiOrder,
  sverkiOrderDisabled,
}: Params) {
  const {
    customerFilter,
    setCustomerFilter,
    actCustomerFilter,
    setActCustomerFilter,
    edoStatusFilterSet,
    setEdoStatusFilterSet,
    billStatusFilterSet,
    setBillStatusFilterSet,
    deliveryStatusFilterSet,
    setDeliveryStatusFilterSet,
    typeFilterSet,
    setTypeFilterSet,
    routeFilterSet,
    setRouteFilterSet,
    invoiceFavoritesOnly,
    setInvoiceFavoritesOnly,
    isCustomerDropdownOpen,
    setIsCustomerDropdownOpen,
    isBillStatusDropdownOpen,
    setIsBillStatusDropdownOpen,
    isTypeDropdownOpen,
    setIsTypeDropdownOpen,
    isRouteDropdownOpen,
    setIsRouteDropdownOpen,
    isDeliveryStatusDropdownOpen,
    setIsDeliveryStatusDropdownOpen,
    isRouteCargoDropdownOpen,
    setIsRouteCargoDropdownOpen,
    isTransportDropdownOpen,
    setIsTransportDropdownOpen,
    isEdoStatusDropdownOpen,
    setIsEdoStatusDropdownOpen,
    isActCustomerDropdownOpen,
    setIsActCustomerDropdownOpen,
    isDateDropdownOpen,
    setIsDateDropdownOpen,
    dateDropdownMode,
    setDateDropdownMode,
    isCustomModalOpen,
    setIsCustomModalOpen,
    sortOrder,
    setSortBy,
    setSortOrder,
    transportFilter,
    setTransportFilter,
    transportSearchQuery,
    setTransportSearchQuery,
  } = filters;

  const {
    dateFilter,
    setDateFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    selectedMonthForFilter,
    setSelectedMonthForFilter,
    selectedYearForFilter,
    setSelectedYearForFilter,
    selectedWeekForFilter,
    setSelectedWeekForFilter,
  } = dateFilterState;

  const {
    invoicesCatalog,
    actsCatalog,
    edoCatalog,
    ordersCatalog,
    tariffsCatalog,
    sverkiCatalog,
    dogovorsCatalog,
    claimsCatalog,
  } = catalogs;

  const { closeDocumentsToolbarDropdownsExceptSendings, closeDocumentsToolbarDropdownsForTransport } =
    useDocumentsToolbarDropdowns({ filters, catalogs });

  const toolbarProps = buildDocumentsPageToolbarProps({
    effectiveServiceMode,
    customerFilter,
    setCustomerFilter,
    uniqueCustomers,
    uniqueOrderCustomers: ordersCatalog.uniqueOrderCustomers,
    isCustomerDropdownOpen,
    setIsCustomerDropdownOpen,
    actCustomerFilter,
    setActCustomerFilter,
    uniqueActCustomers: actsCatalog.uniqueActCustomers,
    isActCustomerDropdownOpen,
    setIsActCustomerDropdownOpen,
    edoStatusFilterSet,
    setEdoStatusFilterSet,
    uniqueEdoStatuses,
    isEdoStatusDropdownOpen,
    setIsEdoStatusDropdownOpen,
    billStatusFilterSet,
    setBillStatusFilterSet,
    invoiceFavoritesOnly,
    setInvoiceFavoritesOnly,
    isBillStatusDropdownOpen,
    setIsBillStatusDropdownOpen,
    deliveryStatusFilterSet,
    setDeliveryStatusFilterSet,
    isDeliveryStatusDropdownOpen,
    setIsDeliveryStatusDropdownOpen,
    typeFilterSet,
    setTypeFilterSet,
    isTypeDropdownOpen,
    setIsTypeDropdownOpen,
    routeFilterSet,
    setRouteFilterSet,
    isRouteDropdownOpen,
    setIsRouteDropdownOpen,
    isRouteCargoDropdownOpen,
    setIsRouteCargoDropdownOpen,
    transportFilter,
    setTransportFilter,
    transportOptionsCurrentSection: sendingsTransportOptions,
    isTransportDropdownOpen,
    setIsTransportDropdownOpen,
    transportSearchQuery,
    setTransportSearchQuery,
    tariffsCatalog,
    sverkiCatalog,
    dogovorsCatalog,
    claimsCatalog,
    ordersCatalog,
    actsCatalog,
    edoCatalog,
    closeDocumentsToolbarDropdownsExceptSendings,
    dateFilterProps: {
      sortOrder,
      onToggleSort: () => { setSortBy("date"); setSortOrder((o) => (o === "desc" ? "asc" : "desc")); },
      dateFilter,
      setDateFilter,
      apiDateRange,
      customDateFrom,
      setCustomDateFrom,
      customDateTo,
      setCustomDateTo,
      selectedMonthForFilter,
      setSelectedMonthForFilter,
      selectedYearForFilter,
      setSelectedYearForFilter,
      selectedWeekForFilter,
      setSelectedWeekForFilter,
      isDateDropdownOpen,
      setIsDateDropdownOpen,
      dateDropdownMode,
      setDateDropdownMode,
      isCustomModalOpen,
      setIsCustomModalOpen,
    },
    loading,
    error,
    actsLoading,
    actsError,
    invoicesSummary: invoicesCatalog.documentsSummary,
    filteredInvoiceCount: invoicesCatalog.filteredInvoiceItems.length,
    actsSummary: actsCatalog.actsSummary,
    filteredActsCount: actsCatalog.filteredActs.length,
    showSums,
    documentsServiceSaasUi,
    tableModeFlatDirect,
    docsMotionEnabled,
    auth,
    effectiveActiveInn,
    activeCustomerName,
    onNewOrder,
    onOpenClaimsCreate,
    onOpenSverkiOrder,
    sverkiOrderDisabled,
  });

  return {
    toolbarProps,
    closeDocumentsToolbarDropdownsExceptSendings,
    closeDocumentsToolbarDropdownsForTransport,
  };
}
