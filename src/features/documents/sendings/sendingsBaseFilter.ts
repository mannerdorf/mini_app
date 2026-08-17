import {
  buildFilteredOrders,
  sendingRowInSelectedPeriod,
  sendingRowMatchesTransportFilter,
} from "../lib/documentsPipeline";
import type { RouteFilterKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import { getSendingRowTransportMode } from "./sendingsTransportHelpers";

export type BuildSendingsForTransportOptionsParams = {
  sendingsItems: unknown[];
  sendingsLoading: boolean;
  effectiveActiveInn: string | null | undefined;
  customerFilter: string;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  effectiveSearchText: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  normalizeTransportDisplay: (value: string) => string;
  dateFrom: string;
  dateTo: string;
};

/**
 * Same filters as the invoices table but without vehicle filter —
 * so the transport dropdown matches the current selection (e.g. only in-transit).
 */
export function buildSendingsForTransportOptions({
  sendingsItems,
  sendingsLoading,
  effectiveActiveInn,
  customerFilter,
  typeFilterSet,
  routeFilterSet,
  effectiveSearchText,
  sortBy,
  sortOrder,
  normalizeTransportDisplay,
  dateFrom,
  dateTo,
}: BuildSendingsForTransportOptionsParams): unknown[] {
  let res = buildFilteredOrders({
    items: sendingsItems || [],
    activeInn: effectiveActiveInn,
    useServiceRequest: true,
    customerFilter,
    typeFilterSet: new Set<TypeFilterKey>(),
    routeFilterSet,
    deliveryStatusFilterSet: new Set(),
    transportFilter: "",
    searchText: effectiveSearchText,
    sortBy,
    sortOrder,
  });

  if (typeFilterSet.size > 0 && res.length > 0) {
    res = res.filter((row) => {
      const r = row as Record<string, unknown>;
      const vehicle = normalizeTransportDisplay(
        String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""),
      );
      const transportType = getSendingRowTransportMode(row, vehicle);
      return (
        (typeFilterSet.has("auto") && transportType === "auto") ||
        (typeFilterSet.has("ferry") && transportType === "ferry") ||
        (typeFilterSet.has("air") && transportType === "air")
      );
    });
  }

  if (!sendingsLoading) {
    res = res.filter((row) => sendingRowInSelectedPeriod(row, dateFrom, dateTo));
  }

  return res;
}

export function filterSendingsByTransport(
  sendingsForTransportOptions: unknown[],
  transportFilter: string,
  transportLinkedCargoNumbers: Set<string> | undefined,
): unknown[] {
  if (!transportFilter) return sendingsForTransportOptions;
  return sendingsForTransportOptions.filter((row) =>
    sendingRowMatchesTransportFilter(row, transportFilter, transportLinkedCargoNumbers),
  );
}
