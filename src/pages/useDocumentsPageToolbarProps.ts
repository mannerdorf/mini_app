import type {
  DocumentsPageToolbarActionBars,
  DocumentsPageToolbarCatalogToolbars,
  DocumentsPageToolbarDateFilterProps,
  DocumentsPageToolbarSummaryProps,
} from "../features/documents/DocumentsPageToolbar";

type BuildInput = {
  effectiveServiceMode: boolean;
  customerFilter: string;
  setCustomerFilter: DocumentsPageToolbarCatalogToolbars["setCustomerFilter"];
  uniqueCustomers: string[];
  uniqueOrderCustomers: string[];
  isCustomerDropdownOpen: boolean;
  setIsCustomerDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsCustomerDropdownOpen"];
  actCustomerFilter: string;
  setActCustomerFilter: DocumentsPageToolbarCatalogToolbars["setActCustomerFilter"];
  uniqueActCustomers: string[];
  isActCustomerDropdownOpen: boolean;
  setIsActCustomerDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsActCustomerDropdownOpen"];
  edoStatusFilterSet: Set<string>;
  setEdoStatusFilterSet: DocumentsPageToolbarCatalogToolbars["setEdoStatusFilterSet"];
  uniqueEdoStatuses: string[];
  isEdoStatusDropdownOpen: boolean;
  setIsEdoStatusDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsEdoStatusDropdownOpen"];
  billStatusFilterSet: DocumentsPageToolbarCatalogToolbars["billStatusFilterSet"];
  setBillStatusFilterSet: DocumentsPageToolbarCatalogToolbars["setBillStatusFilterSet"];
  invoiceFavoritesOnly: boolean;
  setInvoiceFavoritesOnly: DocumentsPageToolbarCatalogToolbars["setInvoiceFavoritesOnly"];
  isBillStatusDropdownOpen: boolean;
  setIsBillStatusDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsBillStatusDropdownOpen"];
  deliveryStatusFilterSet: DocumentsPageToolbarCatalogToolbars["deliveryStatusFilterSet"];
  setDeliveryStatusFilterSet: DocumentsPageToolbarCatalogToolbars["setDeliveryStatusFilterSet"];
  isDeliveryStatusDropdownOpen: boolean;
  setIsDeliveryStatusDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsDeliveryStatusDropdownOpen"];
  typeFilterSet: DocumentsPageToolbarCatalogToolbars["typeFilterSet"];
  setTypeFilterSet: DocumentsPageToolbarCatalogToolbars["setTypeFilterSet"];
  isTypeDropdownOpen: boolean;
  setIsTypeDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsTypeDropdownOpen"];
  routeFilterSet: DocumentsPageToolbarCatalogToolbars["routeFilterSet"];
  setRouteFilterSet: DocumentsPageToolbarCatalogToolbars["setRouteFilterSet"];
  isRouteDropdownOpen: boolean;
  setIsRouteDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsRouteDropdownOpen"];
  isRouteCargoDropdownOpen: boolean;
  setIsRouteCargoDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsRouteCargoDropdownOpen"];
  transportFilter: string;
  setTransportFilter: DocumentsPageToolbarCatalogToolbars["setTransportFilter"];
  transportOptionsCurrentSection: string[];
  isTransportDropdownOpen: boolean;
  setIsTransportDropdownOpen: DocumentsPageToolbarCatalogToolbars["setIsTransportDropdownOpen"];
  transportSearchQuery: string;
  setTransportSearchQuery: DocumentsPageToolbarCatalogToolbars["setTransportSearchQuery"];
  tariffsCatalog: any;
  sverkiCatalog: any;
  dogovorsCatalog: any;
  claimsCatalog: any;
  ordersCatalog: any;
  actsCatalog: any;
  edoCatalog: any;
  closeDocumentsToolbarDropdownsExceptSendings: () => void;
  dateFilterProps: DocumentsPageToolbarDateFilterProps;
  loading: boolean;
  error: string | null;
  actsLoading: boolean;
  actsError: string | null;
  invoicesSummary: DocumentsPageToolbarSummaryProps["invoicesSummary"];
  filteredInvoiceCount: number;
  actsSummary: DocumentsPageToolbarSummaryProps["actsSummary"];
  filteredActsCount: number;
  showSums: boolean;
  documentsServiceSaasUi: boolean;
  tableModeFlatDirect: boolean;
  docsMotionEnabled: boolean;
  auth: DocumentsPageToolbarActionBars["auth"];
  effectiveActiveInn?: string;
  activeCustomerName?: string;
  onNewOrder: () => void;
  onOpenClaimsCreate: () => void;
  onOpenSverkiOrder: () => void;
  sverkiOrderDisabled: boolean;
};

export function buildDocumentsPageToolbarProps(input: BuildInput) {
  const {
    effectiveServiceMode,
    tariffsCatalog,
    sverkiCatalog,
    dogovorsCatalog,
    claimsCatalog,
    ordersCatalog,
    actsCatalog,
    edoCatalog,
    closeDocumentsToolbarDropdownsExceptSendings,
    dateFilterProps,
  } = input;

  const catalogToolbars: DocumentsPageToolbarCatalogToolbars = {
    customerFilter: input.customerFilter,
    setCustomerFilter: input.setCustomerFilter,
    uniqueCustomers: input.uniqueCustomers,
    uniqueOrderCustomers: input.uniqueOrderCustomers,
    isCustomerDropdownOpen: input.isCustomerDropdownOpen,
    setIsCustomerDropdownOpen: input.setIsCustomerDropdownOpen,
    actCustomerFilter: input.actCustomerFilter,
    setActCustomerFilter: input.setActCustomerFilter,
    uniqueActCustomers: input.uniqueActCustomers,
    isActCustomerDropdownOpen: input.isActCustomerDropdownOpen,
    setIsActCustomerDropdownOpen: input.setIsActCustomerDropdownOpen,
    edoStatusFilterSet: input.edoStatusFilterSet,
    setEdoStatusFilterSet: input.setEdoStatusFilterSet,
    uniqueEdoStatuses: input.uniqueEdoStatuses,
    isEdoStatusDropdownOpen: input.isEdoStatusDropdownOpen,
    setIsEdoStatusDropdownOpen: input.setIsEdoStatusDropdownOpen,
    billStatusFilterSet: input.billStatusFilterSet,
    setBillStatusFilterSet: input.setBillStatusFilterSet,
    invoiceFavoritesOnly: input.invoiceFavoritesOnly,
    setInvoiceFavoritesOnly: input.setInvoiceFavoritesOnly,
    isBillStatusDropdownOpen: input.isBillStatusDropdownOpen,
    setIsBillStatusDropdownOpen: input.setIsBillStatusDropdownOpen,
    deliveryStatusFilterSet: input.deliveryStatusFilterSet,
    setDeliveryStatusFilterSet: input.setDeliveryStatusFilterSet,
    isDeliveryStatusDropdownOpen: input.isDeliveryStatusDropdownOpen,
    setIsDeliveryStatusDropdownOpen: input.setIsDeliveryStatusDropdownOpen,
    typeFilterSet: input.typeFilterSet,
    setTypeFilterSet: input.setTypeFilterSet,
    isTypeDropdownOpen: input.isTypeDropdownOpen,
    setIsTypeDropdownOpen: input.setIsTypeDropdownOpen,
    routeFilterSet: input.routeFilterSet,
    setRouteFilterSet: input.setRouteFilterSet,
    isRouteDropdownOpen: input.isRouteDropdownOpen,
    setIsRouteDropdownOpen: input.setIsRouteDropdownOpen,
    isRouteCargoDropdownOpen: input.isRouteCargoDropdownOpen,
    setIsRouteCargoDropdownOpen: input.setIsRouteCargoDropdownOpen,
    transportFilter: input.transportFilter,
    setTransportFilter: input.setTransportFilter,
    transportOptionsCurrentSection: input.transportOptionsCurrentSection,
    isTransportDropdownOpen: input.isTransportDropdownOpen,
    setIsTransportDropdownOpen: input.setIsTransportDropdownOpen,
    transportSearchQuery: input.transportSearchQuery,
    setTransportSearchQuery: input.setTransportSearchQuery,
    tariffs: {
      effectiveServiceMode,
      tariffsCustomerFilter: tariffsCatalog.tariffsCustomerFilter,
      setTariffsCustomerFilter: tariffsCatalog.setTariffsCustomerFilter,
      tariffsCustomerSearchQuery: tariffsCatalog.tariffsCustomerSearchQuery,
      setTariffsCustomerSearchQuery: tariffsCatalog.setTariffsCustomerSearchQuery,
      tariffsRouteFilter: tariffsCatalog.tariffsRouteFilter,
      setTariffsRouteFilter: tariffsCatalog.setTariffsRouteFilter,
      tariffsTypeFilter: tariffsCatalog.tariffsTypeFilter,
      setTariffsTypeFilter: tariffsCatalog.setTariffsTypeFilter,
      uniqueTariffsCustomers: tariffsCatalog.uniqueTariffsCustomers,
      uniqueTariffsRoutes: tariffsCatalog.uniqueTariffsRoutes,
      uniqueTariffsTypes: tariffsCatalog.uniqueTariffsTypes,
      isTariffsCustomerDropdownOpen: tariffsCatalog.isTariffsCustomerDropdownOpen,
      setIsTariffsCustomerDropdownOpen: tariffsCatalog.setIsTariffsCustomerDropdownOpen,
      isTariffsRouteDropdownOpen: tariffsCatalog.isTariffsRouteDropdownOpen,
      setIsTariffsRouteDropdownOpen: tariffsCatalog.setIsTariffsRouteDropdownOpen,
      isTariffsTypeDropdownOpen: tariffsCatalog.isTariffsTypeDropdownOpen,
      setIsTariffsTypeDropdownOpen: tariffsCatalog.setIsTariffsTypeDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    orders: {
      orderReceiverFilter: ordersCatalog.orderReceiverFilter,
      setOrderReceiverFilter: ordersCatalog.setOrderReceiverFilter,
      orderSenderFilter: ordersCatalog.orderSenderFilter,
      setOrderSenderFilter: ordersCatalog.setOrderSenderFilter,
      orderRouteFilter: ordersCatalog.orderRouteFilter,
      setOrderRouteFilter: ordersCatalog.setOrderRouteFilter,
      uniqueOrderReceivers: ordersCatalog.uniqueOrderReceivers,
      uniqueOrderSenders: ordersCatalog.uniqueOrderSenders,
      uniqueOrderRoutes: ordersCatalog.uniqueOrderRoutes,
      isReceiverDropdownOpen: ordersCatalog.isReceiverDropdownOpen,
      setIsReceiverDropdownOpen: ordersCatalog.setIsReceiverDropdownOpen,
      isOrderSenderDropdownOpen: ordersCatalog.isOrderSenderDropdownOpen,
      setIsOrderSenderDropdownOpen: ordersCatalog.setIsOrderSenderDropdownOpen,
      isOrderRouteDropdownOpen: ordersCatalog.isOrderRouteDropdownOpen,
      setIsOrderRouteDropdownOpen: ordersCatalog.setIsOrderRouteDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    acts: {
      effectiveServiceMode,
      actCustomerFilter: input.actCustomerFilter,
      setActCustomerFilter: input.setActCustomerFilter,
      uniqueActCustomers: actsCatalog.uniqueActCustomers,
      isActCustomerDropdownOpen: input.isActCustomerDropdownOpen,
      setIsActCustomerDropdownOpen: input.setIsActCustomerDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    sverki: {
      effectiveServiceMode,
      sverkiCustomerFilter: sverkiCatalog.sverkiCustomerFilter,
      setSverkiCustomerFilter: sverkiCatalog.setSverkiCustomerFilter,
      uniqueSverkiCustomers: sverkiCatalog.uniqueSverkiCustomers,
      isSverkiCustomerDropdownOpen: sverkiCatalog.isSverkiCustomerDropdownOpen,
      setIsSverkiCustomerDropdownOpen: sverkiCatalog.setIsSverkiCustomerDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    dogovors: {
      effectiveServiceMode,
      dogovorsCustomerFilter: dogovorsCatalog.dogovorsCustomerFilter,
      setDogovorsCustomerFilter: dogovorsCatalog.setDogovorsCustomerFilter,
      uniqueDogovorsCustomers: dogovorsCatalog.uniqueDogovorsCustomers,
      isDogovorsCustomerDropdownOpen: dogovorsCatalog.isDogovorsCustomerDropdownOpen,
      setIsDogovorsCustomerDropdownOpen: dogovorsCatalog.setIsDogovorsCustomerDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    claims: {
      effectiveServiceMode,
      claimsStatusFilter: claimsCatalog.claimsStatusFilter,
      setClaimsStatusFilter: claimsCatalog.setClaimsStatusFilter,
      claimsCustomerFilter: claimsCatalog.claimsCustomerFilter,
      setClaimsCustomerFilter: claimsCatalog.setClaimsCustomerFilter,
      uniqueClaimsCustomers: claimsCatalog.uniqueClaimsCustomers,
      isClaimsStatusDropdownOpen: claimsCatalog.isClaimsStatusDropdownOpen,
      setIsClaimsStatusDropdownOpen: claimsCatalog.setIsClaimsStatusDropdownOpen,
      isClaimsCustomerDropdownOpen: claimsCatalog.isClaimsCustomerDropdownOpen,
      setIsClaimsCustomerDropdownOpen: claimsCatalog.setIsClaimsCustomerDropdownOpen,
      closeOtherDropdowns: claimsCatalog.closeClaimsDropdowns,
    },
    edo: {
      edoCounterpartyFilter: edoCatalog.edoCounterpartyFilter,
      setEdoCounterpartyFilter: edoCatalog.setEdoCounterpartyFilter,
      edoCounterpartyFilterLabel: edoCatalog.edoCounterpartyFilterLabel,
      isEdoCounterpartyDropdownOpen: edoCatalog.isEdoCounterpartyDropdownOpen,
      setIsEdoCounterpartyDropdownOpen: edoCatalog.setIsEdoCounterpartyDropdownOpen,
      onCloseOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
    sendings: {
      transportFilter: input.transportFilter,
      setTransportFilter: input.setTransportFilter,
      transportOptionsCurrentSection: input.transportOptionsCurrentSection,
      typeFilterSet: input.typeFilterSet,
      setTypeFilterSet: input.setTypeFilterSet,
      routeFilterSet: input.routeFilterSet,
      setRouteFilterSet: input.setRouteFilterSet,
      deliveryStatusFilterSet: input.deliveryStatusFilterSet,
      setDeliveryStatusFilterSet: input.setDeliveryStatusFilterSet,
      isTypeDropdownOpen: input.isTypeDropdownOpen,
      setIsTypeDropdownOpen: input.setIsTypeDropdownOpen,
      isRouteCargoDropdownOpen: input.isRouteCargoDropdownOpen,
      setIsRouteCargoDropdownOpen: input.setIsRouteCargoDropdownOpen,
      isDeliveryStatusDropdownOpen: input.isDeliveryStatusDropdownOpen,
      setIsDeliveryStatusDropdownOpen: input.setIsDeliveryStatusDropdownOpen,
      closeOtherDropdowns: closeDocumentsToolbarDropdownsExceptSendings,
    },
  };

  const summaryProps: DocumentsPageToolbarSummaryProps = {
    invoicesLoading: input.loading,
    invoicesError: input.error,
    filteredInvoiceCount: input.filteredInvoiceCount,
    invoicesSummary: input.invoicesSummary,
    actsLoading: input.actsLoading,
    actsError: input.actsError,
    filteredActsCount: input.filteredActsCount,
    actsSummary: input.actsSummary,
    showSums: input.showSums,
    documentsServiceSaasUi: input.documentsServiceSaasUi,
    tableModeFlatDirect: input.tableModeFlatDirect,
    docsMotionEnabled: input.docsMotionEnabled,
  };

  const actionBars: DocumentsPageToolbarActionBars = {
    auth: input.auth,
    effectiveActiveInn: input.effectiveActiveInn,
    activeCustomerName: input.activeCustomerName,
    onNewOrder: input.onNewOrder,
    onOpenClaimsCreate: input.onOpenClaimsCreate,
    onOpenSverkiOrder: input.onOpenSverkiOrder,
    sverkiOrderDisabled: input.sverkiOrderDisabled,
  };

  return { dateFilterProps, catalogToolbars, summaryProps, actionBars };
}
