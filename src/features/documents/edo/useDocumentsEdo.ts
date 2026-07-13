import { useEffect, useMemo, useState } from "react";
import { fetchEdoCounterpartyInns } from "../../../api/client/documents";
import { stripOoo } from "../../../lib/formatUtils";
import { invoiceDocSum } from "../../../lib/invoiceAmounts.js";
import { aggregateInvoiceEdoDocStats } from "../../../lib/edoStatus";
import { normalizeKontragentInn, type EdoCounterpartyFilter } from "../../../lib/edoCounterpartyStatus";
import type { CargoStatusFilterKey, RouteFilterKey, SharedBillStatusKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import {
  buildEdoCargoCardItems,
  buildFilteredInvoices,
  getFirstCargoNumberFromInvoice,
  resolveInvoiceFiltersForDocSection,
} from "../lib/documentsPipeline";

type InvoiceFilterInputs = {
  billStatusFilterSet: Set<SharedBillStatusKey>;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  invoiceFavoritesOnly: boolean;
  edoStatusFilterSet: Set<string>;
  transportFilter: string;
  edoCounterpartyFilter: EdoCounterpartyFilter;
};

type UseDocumentsEdoInput = {
  active: boolean;
  items: any[];
  perevozkiItems: any[];
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  customerFilter: string;
  effectiveSearchText: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  invoiceFilterInputs: InvoiceFilterInputs;
  transportLinkedCargoNumbers: Set<string> | undefined;
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  cargoTransportByNumber: Map<string, string>;
  isInvoiceFavorite: (invNum: string | undefined) => boolean;
  expandedTableCustomer: string | null;
  setExpandedTableCustomer: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useDocumentsEdo({
  active,
  items,
  perevozkiItems,
  effectiveActiveInn,
  effectiveServiceMode,
  customerFilter,
  effectiveSearchText,
  sortBy,
  sortOrder,
  tableSortColumn,
  tableSortOrder,
  invoiceFilterInputs,
  transportLinkedCargoNumbers,
  cargoStateByNumber,
  cargoRouteByNumber,
  cargoTransportByNumber,
  isInvoiceFavorite,
  expandedTableCustomer,
  setExpandedTableCustomer,
}: UseDocumentsEdoInput) {
  const [edoPartnerInns, setEdoPartnerInns] = useState<Set<string>>(() => new Set());
  const [edoCounterpartyFilter, setEdoCounterpartyFilter] = useState<EdoCounterpartyFilter>("all");
  const [isEdoCounterpartyDropdownOpen, setIsEdoCounterpartyDropdownOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    fetchEdoCounterpartyInns().then((inns) => {
      const next = new Set(inns.map((inn) => normalizeKontragentInn(inn)).filter(Boolean));
      setEdoPartnerInns(next);
    });
  }, [active]);

  const filteredEdoItems = useMemo(() => {
    const scoped = resolveInvoiceFiltersForDocSection("ЭДО", invoiceFilterInputs);
    return buildFilteredInvoices({
      items,
      activeInn: effectiveActiveInn,
      useServiceRequest: effectiveServiceMode,
      customerFilter,
      invoiceFavoritesOnly: scoped.invoiceFavoritesOnly,
      billStatusFilterSet: scoped.billStatusFilterSet,
      typeFilterSet: scoped.typeFilterSet,
      routeFilterSet: scoped.routeFilterSet,
      deliveryStatusFilterSet: scoped.deliveryStatusFilterSet,
      transportFilter: scoped.transportFilter,
      transportLinkedCargoNumbers,
      searchText: effectiveSearchText,
      edoStatusFilterSet: scoped.edoStatusFilterSet,
      edoCounterpartyFilter,
      edoPartnerInns,
      sortBy,
      sortOrder,
      isInvoiceFavorite,
      getFirstCargoNumberFromInvoice,
      cargoStateByNumber,
      cargoRouteByNumber,
      cargoTransportByNumber,
    });
  }, [
    invoiceFilterInputs,
    edoCounterpartyFilter,
    edoPartnerInns,
    items,
    effectiveActiveInn,
    effectiveServiceMode,
    customerFilter,
    transportLinkedCargoNumbers,
    effectiveSearchText,
    sortBy,
    sortOrder,
    isInvoiceFavorite,
    cargoStateByNumber,
    cargoRouteByNumber,
    cargoTransportByNumber,
  ]);

  const mergedInvoicesEdoTotals = useMemo(
    () => aggregateInvoiceEdoDocStats(filteredEdoItems),
    [filteredEdoItems],
  );

  const edoCargoCardItems = useMemo(
    () => buildEdoCargoCardItems(filteredEdoItems, perevozkiItems, getFirstCargoNumberFromInvoice),
    [filteredEdoItems, perevozkiItems],
  );

  const groupedByCustomer = useMemo(() => {
    const map = new Map<string, { customer: string; items: any[]; sum: number }>();
    filteredEdoItems.forEach((inv) => {
      const key =
        (inv.Customer ?? inv.customer ?? inv.Контрагент ?? inv.Contractor ?? inv.Organization ?? "").trim() ||
        "—";
      const sum = invoiceDocSum(inv);
      const existing = map.get(key);
      if (existing) {
        existing.items.push(inv);
        existing.sum += sum;
      } else map.set(key, { customer: key, items: [inv], sum });
    });
    return Array.from(map.entries()).map(([, v]) => v);
  }, [filteredEdoItems]);

  const sortedGroupedByCustomer = useMemo(() => {
    const key = (row: { customer: string; sum: number; items: any[] }) =>
      tableSortColumn === "customer"
        ? (stripOoo(row.customer) || "").toLowerCase()
        : tableSortColumn === "sum"
          ? row.sum
          : row.items.length;
    return [...groupedByCustomer].sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
  }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

  useEffect(() => {
    if (!active || sortedGroupedByCustomer.length === 0) return;
    setExpandedTableCustomer((prev) => {
      if (prev && sortedGroupedByCustomer.some((row) => row.customer === prev)) return prev;
      return null;
    });
  }, [active, sortedGroupedByCustomer, setExpandedTableCustomer]);

  const edoCounterpartyFilterLabel =
    edoCounterpartyFilter === "with" ? "С ЭДО" : edoCounterpartyFilter === "without" ? "Без ЭДО" : "Все";

  return {
    filteredEdoItems,
    mergedInvoicesEdoTotals,
    edoCargoCardItems,
    sortedGroupedByCustomer,
    edoPartnerInns,
    edoCounterpartyFilter,
    setEdoCounterpartyFilter,
    edoCounterpartyFilterLabel,
    isEdoCounterpartyDropdownOpen,
    setIsEdoCounterpartyDropdownOpen,
  };
}
