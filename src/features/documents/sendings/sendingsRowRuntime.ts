import { collectSendingFreightCargoNumbers } from "../lib/documentsPipeline";
import { getFilterKeyByStatus } from "../../../lib/statusUtils";
import type { StatusFilter } from "../../../types";
import {
  calcTransitHours,
  pickSendingDepartureStart,
  pickSendingExplicitEndDate,
  pickSendingRowStopDate,
  resolveMetricsTransitHours,
} from "../../../lib/transitDateTime";
import { getSendingCargoNumbers } from "./sendingsRowHelpers";

export type SendingsRowRuntimeContext = {
  normCargoKey: (num: string | null | undefined) => string;
  parseDateTimeValue: (value: unknown) => Date | null;
  normalizeTransportDisplay: (value: string) => string;
  cargoStateByNumber: Map<string, string>;
  cargoStopDateByNumber: Map<string, Date>;
  cargoDepartureByNumber: Map<string, Date>;
  cargoPlanDateByNumber: Map<string, Date>;
  sendingPlanDateBySendingId: Map<string, Date>;
  vehicleFreightCargoNumbers: Map<string, Set<string>>;
};

export function buildVehicleFreightCargoNumbers(
  filteredSendings: unknown[],
  normalizeTransportDisplay: (value: string) => string,
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  filteredSendings.forEach((row) => {
    const r = row as Record<string, unknown>;
    const vehicle = normalizeTransportDisplay(
      String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""),
    );
    if (!vehicle) return;
    const bucket = m.get(vehicle) ?? new Set<string>();
    collectSendingFreightCargoNumbers(row).forEach((num) => bucket.add(num));
    m.set(vehicle, bucket);
  });
  return m;
}

export function pickSendingTransitStopDate(
  cargoNumbers: string[],
  rowStatusKey: StatusFilter,
  rowStopDate: Date | null,
  explicitEnd: Date | null,
  start: Date,
  ctx: Pick<SendingsRowRuntimeContext, "cargoStateByNumber" | "cargoStopDateByNumber" | "normCargoKey">,
): { frozen: boolean; end: Date } {
  let readyStopDate: Date | null = null;
  cargoNumbers.forEach((cargoNumber) => {
    const statusKey = getFilterKeyByStatus(String(ctx.cargoStateByNumber.get(ctx.normCargoKey(cargoNumber)) ?? ""));
    if (statusKey !== "ready" && statusKey !== "delivered") return;
    const cargoStopDate =
      ctx.cargoStopDateByNumber.get(ctx.normCargoKey(cargoNumber)) ??
      ctx.cargoStopDateByNumber.get(cargoNumber);
    if (!cargoStopDate) return;
    if (cargoStopDate.getTime() < start.getTime()) return;
    if (!readyStopDate || cargoStopDate.getTime() < readyStopDate.getTime()) {
      readyStopDate = cargoStopDate;
    }
  });
  const hasReadyStatusInRow = rowStatusKey === "ready" || rowStatusKey === "delivered";
  const frozen = readyStopDate != null || hasReadyStatusInRow;
  if (frozen) {
    const end = readyStopDate ?? rowStopDate ?? explicitEnd ?? start;
    return { frozen: true, end };
  }
  return { frozen: false, end: explicitEnd ?? new Date() };
}

function getSendingRowStatusKey(row: unknown): StatusFilter {
  const r = row as Record<string, unknown>;
  return getFilterKeyByStatus(
    String(r?.State ?? r?.state ?? r?.Статус ?? r?.Status ?? r?.StatusName ?? ""),
  );
}

function collectTransitCargoNumbers(row: unknown, ctx: SendingsRowRuntimeContext): string[] {
  const r = row as Record<string, unknown>;
  const vehicle = ctx.normalizeTransportDisplay(
    String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.AutoType ?? ""),
  );
  const rowNumbers = collectSendingFreightCargoNumbers(row);
  if (!vehicle) return rowNumbers;
  const onVehicle = ctx.vehicleFreightCargoNumbers.get(vehicle);
  if (!onVehicle?.size) return rowNumbers;
  return Array.from(onVehicle);
}

export function resolveSendingStatusKey(
  row: unknown,
  ctx: Pick<SendingsRowRuntimeContext, "cargoStateByNumber" | "normCargoKey">,
): StatusFilter {
  const r = row as Record<string, unknown>;
  const rawParcels = r?.Посылки ?? r?.Parcels ?? r?.parcels ?? r?.Packages ?? r?.packages;
  const firstParcel = Array.isArray(rawParcels)
    ? rawParcels[0]
    : rawParcels && typeof rawParcels === "object"
      ? Object.values(rawParcels as Record<string, unknown>)[0]
      : undefined;
  const fp = firstParcel as Record<string, unknown> | undefined;
  const cargoNumber = String(
    r?.НомерПеревозки ??
      r?.Перевозка ??
      r?.CargoNumber ??
      r?.NumberPerevozki ??
      fp?.Перевозка ??
      "",
  ).trim();
  const cargoStatus = cargoNumber ? ctx.cargoStateByNumber.get(ctx.normCargoKey(cargoNumber)) : undefined;
  return getFilterKeyByStatus(
    String(cargoStatus ?? r?.State ?? r?.state ?? r?.Статус ?? r?.Status ?? r?.StatusName ?? ""),
  );
}

export function resolveSendingPlannedArrivalDate(
  row: unknown,
  ctx: Pick<
    SendingsRowRuntimeContext,
    "parseDateTimeValue" | "cargoPlanDateByNumber" | "sendingPlanDateBySendingId" | "normCargoKey"
  >,
): Date | null {
  try {
    const r = row as Record<string, unknown>;
    const plannedKeys = [
      "ДатаПрибытияПлан",
      "ДатаДоставкиПлан",
      "ПланДатаПрибытия",
      "ПлановаяДатаПрибытия",
      "ПлановаяДатаДоставки",
      "DateArrivalPlan",
      "DateDeliveryPlan",
      "DeliveryDatePlan",
      "PlannedDeliveryDate",
      "PlanDeliveryDate",
      "DateArrival",
      "PlanDate",
      "DateVrPlan",
      "DatePrihPlan",
      "ПланируемаяДата",
      "ДатаПланируемойДоставки",
      "ПланДатаДоставки",
      "ПлановаяДата",
      "PlannedArrivalDate",
      "PlannedDate",
      "DatePlan",
      "ПланДата",
    ];
    const dates: Date[] = [];
    const addDate = (value: unknown) => {
      const parsed = ctx.parseDateTimeValue(value);
      if (parsed && parsed.getFullYear() >= 1990) dates.push(parsed);
    };
    const collectFrom = (obj: unknown) => {
      if (!obj || typeof obj !== "object") return;
      const o = obj as Record<string, unknown>;
      plannedKeys.forEach((k) => addDate(o[k]));
    };

    collectFrom(row);
    const rawParcels = r?.Посылки ?? r?.Parcels ?? r?.parcels ?? r?.Packages ?? r?.packages;
    const parcels = Array.isArray(rawParcels)
      ? rawParcels
      : rawParcels && typeof rawParcels === "object"
        ? Object.values(rawParcels as Record<string, unknown>)
        : [];
    parcels.forEach((parcel) => {
      collectFrom(parcel);
      const p = parcel as Record<string, unknown>;
      const goodsRaw = p?.Товары ?? p?.Goods ?? p?.goods;
      if (Array.isArray(goodsRaw)) {
        goodsRaw.forEach((g) => collectFrom(g));
      } else if (goodsRaw && typeof goodsRaw === "object") {
        Object.values(goodsRaw as Record<string, unknown>).forEach((g) => collectFrom(g));
      }
    });

    if (dates.length === 0) {
      getSendingCargoNumbers(row).forEach((num) => {
        const key = ctx.normCargoKey(num);
        const planDate = ctx.cargoPlanDateByNumber.get(key) ?? ctx.cargoPlanDateByNumber.get(num);
        if (planDate) dates.push(planDate);
      });
    }
    if (dates.length === 0) {
      const sendingIds = [r?.Номер ?? r?.Number ?? r?.number, r?.ИДОтправления ?? r?.ID ?? r?.Id].filter(
        (v) => v != null && String(v).trim(),
      );
      sendingIds.forEach((id) => {
        const key = ctx.normCargoKey(String(id));
        const planDate =
          ctx.sendingPlanDateBySendingId.get(key) ?? ctx.sendingPlanDateBySendingId.get(String(id));
        if (planDate) dates.push(planDate);
      });
    }

    if (dates.length === 0) return null;
    const minDate = dates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), dates[0]);
    if (minDate.getFullYear() < 1990) return null;
    return minDate;
  } catch {
    return null;
  }
}

function resolveClientSendingTransitHours(row: unknown, ctx: SendingsRowRuntimeContext): number | null {
  const cargoNumbers = collectTransitCargoNumbers(row, ctx);
  const start = pickSendingDepartureStart(row, cargoNumbers, ctx.cargoDepartureByNumber, ctx.normCargoKey);
  if (!start) return null;
  const rowStatusKey = getSendingRowStatusKey(row);
  const rowStopDate = pickSendingRowStopDate(row);
  const explicitEnd = pickSendingExplicitEndDate(row);
  const { end } = pickSendingTransitStopDate(
    cargoNumbers,
    rowStatusKey,
    rowStopDate,
    explicitEnd,
    start,
    ctx,
  );
  return calcTransitHours(start, end);
}

export function resolveSendingTransitHours(row: unknown, ctx: SendingsRowRuntimeContext): number | null {
  const fromMetrics = resolveMetricsTransitHours(row);
  if (fromMetrics != null) return fromMetrics;
  return resolveClientSendingTransitHours(row, ctx);
}

export function resolveSendingTransitIsFinal(row: unknown, ctx: SendingsRowRuntimeContext): boolean {
  const r = row as Record<string, unknown>;
  if (r?.first_ready_at_metric) return true;

  const cargoNumbers = collectTransitCargoNumbers(row, ctx);
  const start = pickSendingDepartureStart(row, cargoNumbers, ctx.cargoDepartureByNumber, ctx.normCargoKey);
  if (!start) return false;
  const rowStatusKey = getSendingRowStatusKey(row);
  const rowStopDate = pickSendingRowStopDate(row);
  const explicitEnd = pickSendingExplicitEndDate(row);
  return pickSendingTransitStopDate(
    cargoNumbers,
    rowStatusKey,
    rowStopDate,
    explicitEnd,
    start,
    ctx,
  ).frozen;
}

export type SendingsRowRuntime = {
  getSendingStatusKey: (row: unknown) => StatusFilter;
  getSendingPlannedArrivalDate: (row: unknown) => Date | null;
  getSendingTransitHours: (row: unknown) => number | null;
  getSendingTransitIsFinal: (row: unknown) => boolean;
};

export function createSendingsRowRuntime(ctx: SendingsRowRuntimeContext): SendingsRowRuntime {
  return {
    getSendingStatusKey: (row) => resolveSendingStatusKey(row, ctx),
    getSendingPlannedArrivalDate: (row) => resolveSendingPlannedArrivalDate(row, ctx),
    getSendingTransitHours: (row) => resolveSendingTransitHours(row, ctx),
    getSendingTransitIsFinal: (row) => resolveSendingTransitIsFinal(row, ctx),
  };
}
