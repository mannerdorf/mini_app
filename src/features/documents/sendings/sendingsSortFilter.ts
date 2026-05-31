import { cityToCode } from "../../../lib/formatUtils";
import { getSendingRowParcelMetrics } from "./sendingsMetrics";
import type { SendingsSortColumn } from "./useSendingsSortState";
import type { StatusFilter } from "../../../types";

export function filterSendingsByDeliveryStatus<T>(
  rows: T[],
  deliveryStatusFilterSet: Set<StatusFilter>,
  getSendingStatusKey: (row: T) => StatusFilter,
): T[] {
  if (deliveryStatusFilterSet.size === 0) return rows;
  return rows.filter((row) => deliveryStatusFilterSet.has(getSendingStatusKey(row)));
}

export type SortSendingRowsOptions = {
  sendingsSortColumn: SendingsSortColumn;
  sendingsSortOrder: "asc" | "desc";
  normalizeTransportDisplay: (value: string) => string;
  getSendingTransitHours: (row: unknown) => number | null;
  cargoSumByNumber: Map<string, number>;
};

export function sortSendingRows<T extends unknown>(
  rows: T[],
  {
    sendingsSortColumn,
    sendingsSortOrder,
    normalizeTransportDisplay,
    getSendingTransitHours,
    cargoSumByNumber,
  }: SortSendingRowsOptions,
): T[] {
  const getDate = (row: T) => {
    const r = row as Record<string, unknown>;
    return String(r?.Дата ?? r?.Date ?? r?.date ?? "");
  };
  const getNumber = (row: T) => {
    const r = row as Record<string, unknown>;
    return String(r?.Номер ?? r?.Number ?? r?.number ?? "");
  };
  const getRoute = (row: T) => {
    const r = row as Record<string, unknown>;
    const routeFrom = String(
      r?.ПунктОтправленияГородАэропорт ?? r?.CitySender ?? r?.ГородОтправления ?? "",
    ).trim();
    const routeTo = String(
      r?.ПунктНазначенияГородАэропорт ?? r?.CityReceiver ?? r?.ГородНазначения ?? "",
    ).trim();
    return (
      [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(" – ") ||
      [routeFrom, routeTo].filter(Boolean).join(" – ") ||
      ""
    );
  };
  const getType = (row: T) => {
    const r = row as Record<string, unknown>;
    const vehicle = normalizeTransportDisplay(
      String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""),
    );
    const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(vehicle.toUpperCase());
    return hasPlate ? "авто" : "паром";
  };
  const getTransitHours = (row: T) => getSendingTransitHours(row) ?? -1;
  const getVehicle = (row: T) => {
    const r = row as Record<string, unknown>;
    return normalizeTransportDisplay(String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""));
  };
  const getComment = (row: T) => {
    const r = row as Record<string, unknown>;
    return String(r?.Комментарий ?? r?.Comment ?? "");
  };
  const getPaidWeight = (row: T) => getSendingRowParcelMetrics(row, cargoSumByNumber).paidWeight;
  const getCost = (row: T) => getSendingRowParcelMetrics(row, cargoSumByNumber).cost;
  const getDeclaredCost = (row: T) => getSendingRowParcelMetrics(row, cargoSumByNumber).declaredCost;

  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sendingsSortColumn) {
      case "date":
        cmp = getDate(a).localeCompare(getDate(b));
        break;
      case "number":
        cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true });
        break;
      case "route":
        cmp = getRoute(a).localeCompare(getRoute(b));
        break;
      case "type":
        cmp = getType(a).localeCompare(getType(b));
        break;
      case "transitHours":
        cmp = getTransitHours(a) - getTransitHours(b);
        break;
      case "vehicle":
        cmp = getVehicle(a).localeCompare(getVehicle(b));
        break;
      case "comment":
        cmp = getComment(a).localeCompare(getComment(b));
        break;
      case "paidWeight":
        cmp = getPaidWeight(a) - getPaidWeight(b);
        break;
      case "cost":
        cmp = getCost(a) - getCost(b);
        break;
      case "declaredCost":
        cmp = getDeclaredCost(a) - getDeclaredCost(b);
        break;
    }
    return sendingsSortOrder === "asc" ? cmp : -cmp;
  });
}

export function buildSortedSendingRows<T extends unknown>(
  filteredSendings: T[],
  deliveryStatusFilterSet: Set<StatusFilter>,
  getSendingStatusKey: (row: T) => StatusFilter,
  sortOptions: SortSendingRowsOptions,
): T[] {
  const statusFiltered = filterSendingsByDeliveryStatus(
    filteredSendings,
    deliveryStatusFilterSet,
    getSendingStatusKey,
  );
  return sortSendingRows(statusFiltered, sortOptions);
}
