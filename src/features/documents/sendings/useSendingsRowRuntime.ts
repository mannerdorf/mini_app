import { useCallback, useMemo } from "react";
import type { StatusFilter } from "../../../types";
import { buildVisibleSendingMeta } from "./sendingsRowHelpers";
import {
  buildVehicleFreightCargoNumbers,
  createSendingsRowRuntime,
  resolveSendingPlannedArrivalDate,
  resolveSendingStatusKey,
  type SendingsRowRuntime,
  type SendingsRowRuntimeContext,
} from "./sendingsRowRuntime";
import type { VisibleSendingRowMeta } from "./useSendingsBulkActions";

type BaseDeps = Omit<SendingsRowRuntimeContext, "vehicleFreightCargoNumbers"> & {
  filteredSendings: unknown[];
};

export function useSendingsRowRuntime(deps: BaseDeps): SendingsRowRuntime {
  const vehicleFreightCargoNumbers = useMemo(
    () => buildVehicleFreightCargoNumbers(deps.filteredSendings, deps.normalizeTransportDisplay),
    [deps.filteredSendings, deps.normalizeTransportDisplay],
  );

  return useMemo(() => {
    const ctx: SendingsRowRuntimeContext = { ...deps, vehicleFreightCargoNumbers };
    return createSendingsRowRuntime(ctx);
  }, [
    deps.normCargoKey,
    deps.parseDateTimeValue,
    deps.normalizeTransportDisplay,
    deps.cargoStateByNumber,
    deps.cargoStopDateByNumber,
    deps.cargoDepartureByNumber,
    deps.cargoPlanDateByNumber,
    deps.sendingPlanDateBySendingId,
    vehicleFreightCargoNumbers,
  ]);
}

export function useSendingsVisibleMeta(sendingRowsSorted: unknown[]): VisibleSendingRowMeta[] {
  return useMemo(() => buildVisibleSendingMeta(sendingRowsSorted), [sendingRowsSorted]);
}

export function useSendingsStatusKeyResolver(deps: Pick<BaseDeps, "cargoStateByNumber" | "normCargoKey">) {
  return useCallback(
    (row: unknown): StatusFilter => resolveSendingStatusKey(row, deps),
    [deps.cargoStateByNumber, deps.normCargoKey],
  );
}

export function useSendingsPlannedArrivalResolver(
  deps: Pick<
    BaseDeps,
    "parseDateTimeValue" | "cargoPlanDateByNumber" | "sendingPlanDateBySendingId" | "normCargoKey"
  >,
) {
  return useCallback(
    (row: unknown): Date | null => resolveSendingPlannedArrivalDate(row, deps),
    [
      deps.parseDateTimeValue,
      deps.cargoPlanDateByNumber,
      deps.sendingPlanDateBySendingId,
      deps.normCargoKey,
    ],
  );
}
