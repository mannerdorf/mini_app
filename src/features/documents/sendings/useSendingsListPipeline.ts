import { useMemo } from "react";
import type { StatusFilter } from "../../../types";
import { buildSendingsInfographicData } from "./sendingsInfographicData";
import type { SendingsInfographicData } from "./SendingsInfographic";
import { buildSendingsVehicleSummary, buildSendingsTableTotals } from "./sendingsListTotals";
import { buildSortedSendingRows, type SortSendingRowsOptions } from "./sendingsSortFilter";
import type { SendingsSortColumn } from "./useSendingsSortState";

type Params = {
  filteredSendings: unknown[];
  deliveryStatusFilterSet: Set<StatusFilter>;
  getSendingStatusKey: (row: unknown) => StatusFilter;
  sendingsSortColumn: SendingsSortColumn;
  sendingsSortOrder: "asc" | "desc";
  normalizeTransportDisplay: (value: string) => string;
  getSendingTransitHours: (row: unknown) => number | null;
  cargoSumByNumber: Map<string, number>;
  hasAnalytics: boolean;
};

export function useSendingsListPipeline({
  filteredSendings,
  deliveryStatusFilterSet,
  getSendingStatusKey,
  sendingsSortColumn,
  sendingsSortOrder,
  normalizeTransportDisplay,
  getSendingTransitHours,
  cargoSumByNumber,
  hasAnalytics,
}: Params) {
  const sortOptions: SortSendingRowsOptions = useMemo(
    () => ({
      sendingsSortColumn,
      sendingsSortOrder,
      normalizeTransportDisplay,
      getSendingTransitHours,
      cargoSumByNumber,
    }),
    [
      sendingsSortColumn,
      sendingsSortOrder,
      normalizeTransportDisplay,
      getSendingTransitHours,
      cargoSumByNumber,
    ],
  );

  const sendingRowsSorted = useMemo(
    () =>
      buildSortedSendingRows(
        filteredSendings,
        deliveryStatusFilterSet,
        getSendingStatusKey,
        sortOptions,
      ),
    [filteredSendings, deliveryStatusFilterSet, getSendingStatusKey, sortOptions],
  );

  const sendingsInfographic: SendingsInfographicData = useMemo(
    () => buildSendingsInfographicData(sendingRowsSorted, normalizeTransportDisplay, getSendingStatusKey),
    [sendingRowsSorted, normalizeTransportDisplay, getSendingStatusKey],
  );

  const sendingsTableTotals = useMemo(
    () => buildSendingsTableTotals(sendingRowsSorted, cargoSumByNumber),
    [sendingRowsSorted, cargoSumByNumber],
  );

  const { sendingsRepeatedVehicleTotals, sendingsVehicleGrandTotals } = useMemo(
    () =>
      buildSendingsVehicleSummary(
        sendingRowsSorted,
        hasAnalytics,
        normalizeTransportDisplay,
        cargoSumByNumber,
      ),
    [sendingRowsSorted, hasAnalytics, normalizeTransportDisplay, cargoSumByNumber],
  );

  return {
    sendingRowsSorted,
    sendingsInfographic,
    sendingsTableTotals,
    sendingsRepeatedVehicleTotals,
    sendingsVehicleGrandTotals,
  };
}
