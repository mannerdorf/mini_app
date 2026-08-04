import { useDocumentsSendingsPage } from "../features/documents/sendings";
import { cargoModeSwitchMotion } from "./cargoMotion";
import type { AccountPermissions, AuthData, CargoItem } from "../types";
import type { useDocumentsCargoContext } from "../features/documents/hooks/useDocumentsCargoContext";
import type { useDocumentsPageFilters } from "../features/documents/hooks/useDocumentsPageFilters";

type Cargo = ReturnType<typeof useDocumentsCargoContext>;
type Filters = ReturnType<typeof useDocumentsPageFilters>;

type Params = {
  active: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  showCustomerColumn: boolean;
  showSums: boolean;
  hasAnalytics: boolean;
  isSuperAdmin: boolean;
  permissions?: AccountPermissions | null;
  sendingsItems: unknown[];
  sendingsLoading: boolean;
  sendingsError: string | null;
  perevozkiItems: unknown[];
  cargo: Pick<Cargo, "cargoStateByNumber" | "cargoSumByNumber" | "normCargoKey" | "transportLinkedCargoNumbers">;
  apiDateRange: { dateFrom: string; dateTo: string };
  filters: Pick<
    Filters,
    | "customerFilter"
    | "sortBy"
    | "sortOrder"
    | "transportFilter"
    | "setTransportFilter"
    | "typeFilterSet"
    | "routeFilterSet"
    | "deliveryStatusFilterSet"
  >;
  effectiveSearchText: string;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
  onOpenAisWithMmsi?: (mmsi: string) => void;
  dateFilter: Filters["dateFilter"];
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: string;
  selectedYearForFilter: string;
  selectedWeekForFilter: string;
};

export function useDocumentsSendingsWiring({
  active,
  auth,
  effectiveActiveInn,
  effectiveServiceMode,
  showCustomerColumn,
  showSums,
  hasAnalytics,
  isSuperAdmin,
  permissions,
  sendingsItems,
  sendingsLoading,
  sendingsError,
  perevozkiItems,
  cargo,
  apiDateRange,
  filters,
  effectiveSearchText,
  tableModeEffective,
  docsMotionEnabled,
  onOpenCargo,
  onOpenAisWithMmsi,
  dateFilter,
  customDateFrom,
  customDateTo,
  selectedMonthForFilter,
  selectedYearForFilter,
  selectedWeekForFilter,
}: Params) {
  return useDocumentsSendingsPage({
    active,
    auth,
    effectiveActiveInn,
    effectiveServiceMode,
    showCustomerColumn,
    showSums,
    hasAnalytics,
    isSuperAdmin,
    permissions,
    sendingsItems: sendingsItems || [],
    sendingsLoading,
    sendingsError,
    perevozkiItems: perevozkiItems || [],
    cargoStateByNumber: cargo.cargoStateByNumber,
    cargoSumByNumber: cargo.cargoSumByNumber,
    normCargoKey: cargo.normCargoKey,
    apiDateRange,
    customerFilter: filters.customerFilter,
    effectiveSearchText,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    transportFilter: filters.transportFilter,
    setTransportFilter: filters.setTransportFilter,
    transportLinkedCargoNumbers: cargo.transportLinkedCargoNumbers,
    typeFilterSet: filters.typeFilterSet,
    routeFilterSet: filters.routeFilterSet,
    deliveryStatusFilterSet: filters.deliveryStatusFilterSet,
    tableModeEffective,
    docsMotionEnabled,
    cargoModeSwitchMotion,
    onOpenCargo,
    onOpenAisWithMmsi,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  });
}
