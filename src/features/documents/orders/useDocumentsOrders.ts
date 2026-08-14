import { useCallback, useMemo, useState } from "react";
import { cityToCode } from "../../../lib/formatUtils";
import type { RouteFilterKey, StatusFilter, TypeFilterKey } from "../../../lib/sharedListFilters";
import { buildFilteredOrders } from "../lib/documentsPipeline";
import { deleteDocumentsOrder } from "../../../api/client/documentsOrder";
import type { AuthData } from "../../../types";

type UseDocumentsOrdersInput = {
  active: boolean;
  ordersItems: any[];
  auth: AuthData;
  effectiveActiveInn?: string;
  activeCustomerName?: string;
  effectiveServiceMode: boolean;
  customerFilter: string;
  effectiveSearchText: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onOrdersMutate?: () => void;
};

export function useDocumentsOrders({
  active,
  ordersItems,
  auth,
  effectiveActiveInn,
  activeCustomerName,
  effectiveServiceMode,
  customerFilter,
  effectiveSearchText,
  sortBy,
  sortOrder,
  onOrdersMutate,
}: UseDocumentsOrdersInput) {
  const [orderReceiverFilter, setOrderReceiverFilter] = useState<string>("");
  const [orderSenderFilter, setOrderSenderFilter] = useState<string>("");
  const [orderRouteFilter, setOrderRouteFilter] = useState<string>("all");
  const [ordersSortColumn, setOrdersSortColumn] = useState<
    "date" | "number" | "clientNumber" | "pickupDate" | "cargo" | "sender" | "receiver" | "route" | "customer" | "comment"
  >("date");
  const [ordersSortOrder, setOrdersSortOrder] = useState<"asc" | "desc">("desc");
  const [ordersParcelsSortColumn, setOrdersParcelsSortColumn] = useState<
    "parcel" | "cargo" | "tmc" | "consolidation" | "count" | "cost"
  >("parcel");
  const [ordersParcelsSortOrder, setOrdersParcelsSortOrder] = useState<"asc" | "desc">("asc");
  const [expandedOrderRow, setExpandedOrderRow] = useState<string | null>(null);
  const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
  const [isOrderSenderDropdownOpen, setIsOrderSenderDropdownOpen] = useState(false);
  const [isOrderRouteDropdownOpen, setIsOrderRouteDropdownOpen] = useState(false);
  const [deletingPendingOrderId, setDeletingPendingOrderId] = useState<number | null>(null);
  const [deleteOrderError, setDeleteOrderError] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const base = buildFilteredOrders({
      items: ordersItems || [],
      activeInn: effectiveActiveInn,
      activeCustomerName,
      useServiceRequest: effectiveServiceMode,
      customerFilter,
      typeFilterSet: new Set<TypeFilterKey>(),
      routeFilterSet: new Set<RouteFilterKey>(),
      deliveryStatusFilterSet: new Set<StatusFilter>(),
      transportFilter: "",
      searchText: effectiveSearchText,
      sortBy,
      sortOrder,
    });
    return base.filter((i: any) => {
      if (
        orderReceiverFilter &&
        String(
          i?.ПолучательНаименование ??
            i?.Получатель ??
            i?.ГрузополучательНаименование ??
            i?.Грузополучатель ??
            i?.Receiver ??
            i?.receiver ??
            i?.Consignee ??
            "",
        ).trim() !== orderReceiverFilter
      )
        return false;
      if (
        orderSenderFilter &&
        String(
          i?.ОтправительНаименование ??
            i?.Отправитель ??
            i?.ГрузоотправительНаименование ??
            i?.Грузоотправитель ??
            i?.Sender ??
            i?.sender ??
            i?.Shipper ??
            i?.Consignor ??
            "",
        ).trim() !== orderSenderFilter
      )
        return false;
      if (orderRouteFilter !== "all") {
        const fromRaw = String(
          i?.ПунктОтправкиНаименование ??
            i?.ПунктОтправленияНаименование ??
            i?.ПунктОтправки ??
            i?.ПунктОтправления ??
            i?.CitySender ??
            "",
        ).trim();
        const toRaw = String(
          i?.ПунктНазначенияНаименование ??
            i?.ПунктПолученияНаименование ??
            i?.ПунктНазначения ??
            i?.ПунктДоставки ??
            i?.CityReceiver ??
            "",
        ).trim();
        const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(" – ");
        if (route !== orderRouteFilter) return false;
      }
      return true;
    });
  }, [
    ordersItems,
    effectiveActiveInn,
    activeCustomerName,
    effectiveServiceMode,
    customerFilter,
    effectiveSearchText,
    sortBy,
    sortOrder,
    orderReceiverFilter,
    orderSenderFilter,
    orderRouteFilter,
  ]);

  const orderRowsSorted = useMemo(() => {
    const getDate = (row: any) => String(row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? "");
    const getNumber = (row: any) =>
      String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? "");
    const getClientNumber = (row: any) => String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? "");
    const getPickupDate = (row: any) => String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? "");
    const getSender = (row: any) =>
      String(
        row?.ОтправительНаименование ??
          row?.Отправитель ??
          row?.ГрузоотправительНаименование ??
          row?.Грузоотправитель ??
          row?.Sender ??
          row?.sender ??
          row?.Shipper ??
          row?.Consignor ??
          "",
      );
    const getReceiver = (row: any) =>
      String(
        row?.ПолучательНаименование ??
          row?.Получатель ??
          row?.ГрузополучательНаименование ??
          row?.Грузополучатель ??
          row?.Receiver ??
          row?.receiver ??
          row?.Consignee ??
          "",
      );
    const getCustomer = (row: any) =>
      String(
        row?.ЗаказчикНаименование ??
          row?.Заказчик ??
          row?.Customer ??
          row?.customer ??
          row?.Контрагент ??
          row?.Contractor ??
          row?.Organization ??
          row?.ПлательщикНаименование ??
          row?.PayerName ??
          "",
      );
    const getComment = (row: any) => String(row?.Комментарий ?? row?.Comment ?? row?.Примечание ?? row?.Note ?? "");
    const getCargo = (row: any) => {
      const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
      const firstParcel = Array.isArray(rawParcels)
        ? rawParcels[0]
        : rawParcels && typeof rawParcels === "object"
          ? Object.values(rawParcels as Record<string, any>)[0]
          : undefined;
      return String(
        row?.НомерПеревозки ??
          row?.Перевозка ??
          row?.CargoNumber ??
          row?.NumberPerevozki ??
          (firstParcel as any)?.Перевозка ??
          "",
      );
    };
    const getRoute = (row: any) => {
      const from = String(
        row?.ПунктОтправкиНаименование ??
          row?.ПунктОтправленияНаименование ??
          row?.ПунктОтправки ??
          row?.ПунктОтправления ??
          row?.CitySender ??
          "",
      ).trim();
      const to = String(
        row?.ПунктНазначенияНаименование ??
          row?.ПунктПолученияНаименование ??
          row?.ПунктНазначения ??
          row?.ПунктДоставки ??
          row?.CityReceiver ??
          "",
      ).trim();
      return [cityToCode(from) || from, cityToCode(to) || to].filter(Boolean).join(" – ");
    };
    return [...filteredOrders].sort((a, b) => {
      let cmp = 0;
      switch (ordersSortColumn) {
        case "date":
          cmp = getDate(a).localeCompare(getDate(b));
          break;
        case "number":
          cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true });
          break;
        case "clientNumber":
          cmp = getClientNumber(a).localeCompare(getClientNumber(b), undefined, { numeric: true });
          break;
        case "pickupDate":
          cmp = getPickupDate(a).localeCompare(getPickupDate(b));
          break;
        case "cargo":
          cmp = getCargo(a).localeCompare(getCargo(b), undefined, { numeric: true });
          break;
        case "sender":
          cmp = getSender(a).localeCompare(getSender(b));
          break;
        case "receiver":
          cmp = getReceiver(a).localeCompare(getReceiver(b));
          break;
        case "route":
          cmp = getRoute(a).localeCompare(getRoute(b));
          break;
        case "customer":
          cmp = getCustomer(a).localeCompare(getCustomer(b));
          break;
        case "comment":
          cmp = getComment(a).localeCompare(getComment(b));
          break;
      }
      return ordersSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredOrders, ordersSortColumn, ordersSortOrder]);

  const handleOrdersSort = useCallback(
    (
      column:
        | "date"
        | "number"
        | "clientNumber"
        | "pickupDate"
        | "cargo"
        | "sender"
        | "receiver"
        | "route"
        | "customer"
        | "comment",
    ) => {
      if (ordersSortColumn === column) {
        setOrdersSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setOrdersSortColumn(column);
      setOrdersSortOrder(column === "date" || column === "pickupDate" ? "desc" : "asc");
    },
    [ordersSortColumn],
  );

  const handleOrdersParcelsSort = useCallback(
    (column: "parcel" | "cargo" | "tmc" | "consolidation" | "count" | "cost") => {
      if (ordersParcelsSortColumn === column) {
        setOrdersParcelsSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setOrdersParcelsSortColumn(column);
      setOrdersParcelsSortOrder("asc");
    },
    [ordersParcelsSortColumn],
  );

  const uniqueOrderCustomers = useMemo(
    () =>
      [
        ...new Set(
          (ordersItems || [])
            .map((i: any) =>
              String(
                i?.ЗаказчикНаименование ??
                  i?.Заказчик ??
                  i?.Customer ??
                  i?.customer ??
                  i?.Контрагент ??
                  i?.Contractor ??
                  i?.Organization ??
                  i?.ПлательщикНаименование ??
                  i?.PayerName ??
                  "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "ru")),
    [ordersItems],
  );

  const uniqueOrderReceivers = useMemo(
    () =>
      [
        ...new Set(
          (ordersItems || [])
            .map((i: any) =>
              String(
                i?.ПолучательНаименование ??
                  i?.Получатель ??
                  i?.ГрузополучательНаименование ??
                  i?.Грузополучатель ??
                  i?.Receiver ??
                  i?.receiver ??
                  i?.Consignee ??
                  "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "ru")),
    [ordersItems],
  );

  const uniqueOrderSenders = useMemo(
    () =>
      [
        ...new Set(
          (ordersItems || [])
            .map((i: any) =>
              String(
                i?.ОтправительНаименование ??
                  i?.Отправитель ??
                  i?.ГрузоотправительНаименование ??
                  i?.Грузоотправитель ??
                  i?.Sender ??
                  i?.sender ??
                  i?.Shipper ??
                  i?.Consignor ??
                  "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "ru")),
    [ordersItems],
  );

  const uniqueOrderRoutes = useMemo(() => {
    const set = new Set<string>();
    (ordersItems || []).forEach((item: any) => {
      const fromRaw = String(
        item?.ПунктОтправкиНаименование ??
          item?.ПунктОтправленияНаименование ??
          item?.ПунктОтправки ??
          item?.ПунктОтправления ??
          item?.CitySender ??
          "",
      ).trim();
      const toRaw = String(
        item?.ПунктНазначенияНаименование ??
          item?.ПунктПолученияНаименование ??
          item?.ПунктНазначения ??
          item?.ПунктДоставки ??
          item?.CityReceiver ??
          "",
      ).trim();
      const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(" – ");
      if (route) set.add(route);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [ordersItems]);

  const resetExpandedOrderRow = useCallback(() => {
    if (active) setExpandedOrderRow(null);
  }, [active]);

  const handleDeletePendingOrder = useCallback(
    async (row: Record<string, unknown>) => {
      if (row?._pendingOrder !== true) return;
      const pendingOrderId = Number(row._pendingOrderId);
      if (!Number.isFinite(pendingOrderId) || pendingOrderId < 1) return;
      if (!auth?.login || !auth?.password) return;
      if (!window.confirm("Удалить заявку?")) return;

      setDeletingPendingOrderId(pendingOrderId);
      setDeleteOrderError(null);
      try {
        const nomerZayavki = String(
          row.НомерЗаявки ?? row.Number ?? row.number ?? "",
        ).trim();
        await deleteDocumentsOrder(
          {
            login: auth.login,
            password: auth.password,
            inn: effectiveActiveInn || auth.inn || "",
            customerName: activeCustomerName || undefined,
          },
          pendingOrderId,
          nomerZayavki || undefined,
        );
        onOrdersMutate?.();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Не удалось удалить заявку";
        setDeleteOrderError(message);
        window.alert(message);
      } finally {
        setDeletingPendingOrderId(null);
      }
    },
    [auth?.login, auth?.password, auth?.inn, effectiveActiveInn, activeCustomerName, onOrdersMutate],
  );

  return {
    orderReceiverFilter,
    setOrderReceiverFilter,
    orderSenderFilter,
    setOrderSenderFilter,
    orderRouteFilter,
    setOrderRouteFilter,
    filteredOrders,
    orderRowsSorted,
    ordersSortColumn,
    ordersSortOrder,
    ordersParcelsSortColumn,
    ordersParcelsSortOrder,
    handleOrdersSort,
    handleOrdersParcelsSort,
    expandedOrderRow,
    setExpandedOrderRow,
    resetExpandedOrderRow,
    uniqueOrderCustomers,
    uniqueOrderReceivers,
    uniqueOrderSenders,
    uniqueOrderRoutes,
    isReceiverDropdownOpen,
    setIsReceiverDropdownOpen,
    isOrderSenderDropdownOpen,
    setIsOrderSenderDropdownOpen,
    isOrderRouteDropdownOpen,
    setIsOrderRouteDropdownOpen,
    deletingPendingOrderId,
    deleteOrderError,
    handleDeletePendingOrder,
  };
}
