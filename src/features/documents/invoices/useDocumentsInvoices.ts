import { useCallback, useEffect, useMemo, useState } from "react";
import {
  invoiceBalance,
  invoiceDocSum,
  invoiceSumPaid,
} from "../../../lib/invoiceAmounts.js";
import { stripOoo, normalizeInvoiceStatus } from "../../../lib/formatUtils";
import type { EdoCounterpartyFilter } from "../../../lib/edoCounterpartyStatus";
import type { CargoStatusFilterKey, RouteFilterKey, SharedBillStatusKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import {
  buildFilteredInvoices,
  buildInvoicesSummary,
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

type UseDocumentsInvoicesInput = {
  active: boolean;
  items: any[];
  actsItems: any[];
  perevozkiItems: any[];
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  customerFilter: string;
  effectiveSearchText: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  tableModeGroupedByCustomer: boolean;
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  innerTableSortColumn: "number" | "date" | "status" | "sum" | "paid" | "balance" | "deliveryStatus" | "route";
  innerTableSortOrder: "asc" | "desc";
  invoiceFilterInputs: InvoiceFilterInputs;
  transportLinkedCargoNumbers: Set<string>;
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  cargoTransportByNumber: Map<string, string>;
  cargoSumPaidByNumber: Map<string, number>;
  normCargoKey: (raw: string) => string;
  expandedTableCustomer: string | null;
  setExpandedTableCustomer: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useDocumentsInvoices({
  active,
  items,
  actsItems,
  perevozkiItems,
  effectiveActiveInn,
  effectiveServiceMode,
  customerFilter,
  effectiveSearchText,
  sortBy,
  sortOrder,
  tableModeGroupedByCustomer,
  tableSortColumn,
  tableSortOrder,
  innerTableSortColumn,
  innerTableSortOrder,
  invoiceFilterInputs,
  transportLinkedCargoNumbers,
  cargoStateByNumber,
  cargoRouteByNumber,
  cargoTransportByNumber,
  cargoSumPaidByNumber,
  normCargoKey,
  expandedTableCustomer,
  setExpandedTableCustomer,
}: UseDocumentsInvoicesInput) {
  const [invoiceFavVersion, setInvoiceFavVersion] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const toggleInvoiceFavorite = useCallback((invNum: string | undefined) => {
    if (!invNum) return;
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem("haulz.invoiceFavorites");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const set = new Set(arr);
      if (set.has(invNum)) set.delete(invNum);
      else set.add(invNum);
      localStorage.setItem("haulz.invoiceFavorites", JSON.stringify([...set]));
      setInvoiceFavVersion((v) => v + 1);
    } catch {}
  }, []);

  const isInvoiceFavorite = useCallback(
    (invNum: string | undefined): boolean => {
      void invoiceFavVersion;
      if (!invNum) return false;
      try {
        const raw = typeof localStorage !== "undefined" && localStorage.getItem("haulz.invoiceFavorites");
        const arr: string[] = raw ? JSON.parse(raw) : [];
        return arr.includes(invNum);
      } catch {
        return false;
      }
    },
    [invoiceFavVersion]
  );

  const filteredInvoiceItems = useMemo(() => {
    const scoped = resolveInvoiceFiltersForDocSection("Счета", invoiceFilterInputs);
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
      edoCounterpartyFilter: "all",
      sortBy,
      sortOrder,
      isInvoiceFavorite,
      getFirstCargoNumberFromInvoice,
      cargoStateByNumber,
      cargoRouteByNumber,
      cargoTransportByNumber,
      cargoSumPaidByNumber,
    });
  }, [
    invoiceFilterInputs,
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
    cargoSumPaidByNumber,
  ]);

  const documentsSummary = useMemo(
    () =>
      buildInvoicesSummary(filteredInvoiceItems, actsItems, perevozkiItems, {
        cargoSumPaidByNumber,
        getFirstCargoNumber: getFirstCargoNumberFromInvoice,
        useBalance: true,
      }),
    [filteredInvoiceItems, actsItems, perevozkiItems, cargoSumPaidByNumber],
  );

  const groupedByCustomer = useMemo(() => {
    const map = new Map<string, { customer: string; items: any[]; sum: number }>();
    filteredInvoiceItems.forEach((inv) => {
      const key = (inv.Customer ?? inv.customer ?? inv.Контрагент ?? inv.Contractor ?? inv.Organization ?? "").trim() || "—";
      const sum = invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
      const existing = map.get(key);
      if (existing) {
        existing.items.push(inv);
        existing.sum += sum;
      } else map.set(key, { customer: key, items: [inv], sum });
    });
    return Array.from(map.entries()).map(([, v]) => v);
  }, [filteredInvoiceItems]);

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
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
  }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

  useEffect(() => {
    if (!active || sortedGroupedByCustomer.length === 0) return;
    if (!tableModeGroupedByCustomer) return;
    setExpandedTableCustomer((prev) => {
      if (prev && sortedGroupedByCustomer.some((row) => row.customer === prev)) return prev;
      return null;
    });
  }, [active, tableModeGroupedByCustomer, sortedGroupedByCustomer, setExpandedTableCustomer]);

  const sortInvoices = useCallback(
    (invoiceItems: any[]) => {
      const getNum = (inv: any) => (inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? "").toString().replace(/^0000-/, "");
      const getDate = (inv: any) => (inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "").toString();
      const getStatus = (inv: any) =>
        normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? "");
      const getSum = (inv: any) => invoiceDocSum(inv);
      const getPaid = (inv: any) => invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
      const getBalance = (inv: any) => invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
      const getDeliveryState = (inv: any) => {
        const num = getFirstCargoNumberFromInvoice(inv);
        return (num ? cargoStateByNumber.get(normCargoKey(num)) : undefined) ?? "";
      };
      const getRoute = (inv: any) => {
        const num = getFirstCargoNumberFromInvoice(inv);
        return (num ? cargoRouteByNumber.get(normCargoKey(num)) : undefined) ?? "";
      };
      return [...invoiceItems].sort((a, b) => {
        let cmp = 0;
        switch (innerTableSortColumn) {
          case "number":
            cmp = (getNum(a) || "").localeCompare(getNum(b) || "", undefined, { numeric: true });
            break;
          case "date":
            cmp = (getDate(a) || "").localeCompare(getDate(b) || "");
            break;
          case "status":
            cmp = (getStatus(a) || "").localeCompare(getStatus(b) || "");
            break;
          case "sum":
            cmp = getSum(a) - getSum(b);
            break;
          case "paid":
            cmp = getPaid(a) - getPaid(b);
            break;
          case "balance":
            cmp = getBalance(a) - getBalance(b);
            break;
          case "deliveryStatus":
            cmp = (getDeliveryState(a) || "").localeCompare(getDeliveryState(b) || "");
            break;
          case "route":
            cmp = (getRoute(a) || "").localeCompare(getRoute(b) || "");
            break;
        }
        return innerTableSortOrder === "asc" ? cmp : -cmp;
      });
    },
    [
      innerTableSortColumn,
      innerTableSortOrder,
      cargoStateByNumber,
      cargoRouteByNumber,
      cargoSumPaidByNumber,
      normCargoKey,
    ]
  );

  return {
    toggleInvoiceFavorite,
    isInvoiceFavorite,
    filteredInvoiceItems,
    documentsSummary,
    sortedGroupedByCustomer,
    sortInvoices,
    selectedInvoice,
    setSelectedInvoice,
    expandedTableCustomer,
    setExpandedTableCustomer,
  };
}
