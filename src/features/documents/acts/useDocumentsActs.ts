import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../../../lib/formatUtils";
import { invoiceDocSum } from "../../../lib/invoiceAmounts.js";
import {
  buildActsSummary,
  buildFilteredActs,
  findInvoiceLinkedToAct,
  getFirstCargoNumberFromInvoice,
} from "../lib/documentsPipeline";

type UseDocumentsActsInput = {
  active: boolean;
  actsItems: any[];
  items: any[];
  perevozkiItems: any[];
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  actCustomerFilter: string;
  effectiveSearchText: string;
  edoStatusFilterSet: Set<string>;
  transportFilter: string;
  transportLinkedCargoNumbers: Set<string> | undefined;
  sortOrder: "asc" | "desc";
  tableModeGroupedByCustomer: boolean;
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  cargoTransportByNumber: Map<string, string>;
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  normCargoKey: (raw: string) => string;
};

export function useDocumentsActs({
  active,
  actsItems,
  items,
  perevozkiItems,
  effectiveActiveInn,
  effectiveServiceMode,
  actCustomerFilter,
  effectiveSearchText,
  edoStatusFilterSet,
  transportFilter,
  transportLinkedCargoNumbers,
  sortOrder,
  tableModeGroupedByCustomer,
  tableSortColumn,
  tableSortOrder,
  cargoTransportByNumber,
  cargoStateByNumber,
  cargoRouteByNumber,
  normCargoKey,
}: UseDocumentsActsInput) {
  const [innerTableActSortColumn, setInnerTableActSortColumn] = useState<
    "number" | "date" | "status" | "sum" | "deliveryStatus" | "route"
  >("date");
  const [innerTableActSortOrder, setInnerTableActSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedTableActCustomer, setExpandedTableActCustomer] = useState<string | null>(null);
  const [selectedAct, setSelectedAct] = useState<any | null>(null);

  const sortedActs = useMemo(() => {
    const list = [...(actsItems || [])];
    const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? "").toString();
    list.sort((a, b) => {
      const cmp = getDate(a).localeCompare(getDate(b));
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return list;
  }, [actsItems, sortOrder]);

  const filteredActs = useMemo(() => {
    return buildFilteredActs({
      sortedActs,
      activeInn: effectiveActiveInn,
      useServiceRequest: effectiveServiceMode,
      actCustomerFilter,
      searchText: effectiveSearchText,
      edoStatusFilterSet,
      transportFilter,
      transportLinkedCargoNumbers,
      getFirstCargoNumberFromInvoice,
      cargoTransportByNumber,
      invoices: items,
    });
  }, [
    sortedActs,
    effectiveActiveInn,
    effectiveServiceMode,
    actCustomerFilter,
    effectiveSearchText,
    edoStatusFilterSet,
    transportFilter,
    transportLinkedCargoNumbers,
    cargoTransportByNumber,
    items,
  ]);

  const actsSummary = useMemo(
    () => buildActsSummary(filteredActs, perevozkiItems),
    [filteredActs, perevozkiItems],
  );

  const groupedActsByCustomer = useMemo(() => {
    const map = new Map<string, { customer: string; items: any[]; sum: number }>();
    filteredActs.forEach((act: any) => {
      const key =
        (act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? "").trim() ||
        "—";
      const v = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
      const sum = typeof v === "string" ? parseFloat(v) || 0 : v || 0;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(act);
        existing.sum += sum;
      } else map.set(key, { customer: key, items: [act], sum });
    });
    return Array.from(map.entries()).map(([, v]) => v);
  }, [filteredActs]);

  const sortedGroupedActsByCustomer = useMemo(() => {
    const key = (row: { customer: string; sum: number; items: any[] }) =>
      tableSortColumn === "customer"
        ? (stripOoo(row.customer) || "").toLowerCase()
        : tableSortColumn === "sum"
          ? row.sum
          : row.items.length;
    return [...groupedActsByCustomer].sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
  }, [groupedActsByCustomer, tableSortColumn, tableSortOrder]);

  useEffect(() => {
    if (!active || !tableModeGroupedByCustomer || sortedGroupedActsByCustomer.length === 0) return;
    setExpandedTableActCustomer((prev) => {
      if (prev && sortedGroupedActsByCustomer.some((row) => row.customer === prev)) return prev;
      return null;
    });
  }, [active, tableModeGroupedByCustomer, sortedGroupedActsByCustomer]);

  const handleInnerTableActSort = useCallback(
    (column: "number" | "date" | "status" | "sum" | "deliveryStatus" | "route") => {
      if (innerTableActSortColumn === column) setInnerTableActSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      else {
        setInnerTableActSortColumn(column);
        setInnerTableActSortOrder(column === "date" ? "desc" : "asc");
      }
    },
    [innerTableActSortColumn],
  );

  const sortActs = useCallback(
    (acts: any[]) => {
      const getNum = (a: any) => (a.Number ?? a.number ?? "").toString().replace(/^0000-/, "");
      const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? "").toString();
      const getSum = (a: any) => {
        const linkedInv = findInvoiceLinkedToAct(a, items);
        const fromInv = linkedInv ? invoiceDocSum(linkedInv) : 0;
        if (fromInv > 0) return fromInv;
        return invoiceDocSum(a);
      };
      const getLinkedInv = (a: any) => findInvoiceLinkedToAct(a, items);
      const getStatus = (a: any) => {
        const inv = getLinkedInv(a);
        return normalizeInvoiceStatus(
          inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? "",
        );
      };
      const getDeliveryState = (a: any) => {
        const inv = getLinkedInv(a) ?? a;
        const num = getFirstCargoNumberFromInvoice(inv);
        return (num ? cargoStateByNumber.get(normCargoKey(num)) : undefined) ?? "";
      };
      const getRoute = (a: any) => {
        const inv = getLinkedInv(a) ?? a;
        const num = getFirstCargoNumberFromInvoice(inv);
        const route = num ? cargoRouteByNumber.get(normCargoKey(num)) : undefined;
        if (route) return route;
        const ainv = a.Invoice ?? a.invoice ?? a.Счёт ?? "";
        return ainv ? `Сч. ${formatInvoiceNumber(String(ainv))}` : "";
      };
      return [...acts].sort((a, b) => {
        let cmp = 0;
        switch (innerTableActSortColumn) {
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
          case "deliveryStatus":
            cmp = (getDeliveryState(a) || "").localeCompare(getDeliveryState(b) || "");
            break;
          case "route":
            cmp = (getRoute(a) || "").localeCompare(getRoute(b) || "");
            break;
        }
        return innerTableActSortOrder === "asc" ? cmp : -cmp;
      });
    },
    [
      innerTableActSortColumn,
      innerTableActSortOrder,
      items,
      cargoStateByNumber,
      cargoRouteByNumber,
      normCargoKey,
    ],
  );

  const uniqueActCustomers = useMemo(
    () =>
      [
        ...new Set(
          (actsItems || [])
            .map((a: any) =>
              (a.Customer ?? a.customer ?? a.Контрагент ?? a.Contractor ?? a.Organization ?? "").trim(),
            )
            .filter(Boolean),
        ),
      ].sort(),
    [actsItems],
  );

  return {
    filteredActs,
    actsSummary,
    sortedGroupedActsByCustomer,
    expandedTableActCustomer,
    setExpandedTableActCustomer,
    innerTableActSortColumn,
    innerTableActSortOrder,
    handleInnerTableActSort,
    sortActs,
    selectedAct,
    setSelectedAct,
    uniqueActCustomers,
  };
}
