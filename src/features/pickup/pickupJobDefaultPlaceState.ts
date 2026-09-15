import { warehouseForCity } from "../../../lib/haulzCalculator/warehouses";
import type { CityCode } from "../../../lib/haulzCalculator/types";
import type { JobData } from "../../../lib/pickup/model";
import {
  emptyPvzContactFields,
  type PvzSelectionState,
} from "../documents/orders/DocumentsOrderPvzSection";

/** По умолчанию — склад HAULZ в городе забора. */
export function defaultPickupDefaultPlaceState(city: CityCode): PvzSelectionState {
  const wh = warehouseForCity(city);
  return {
    deliveryMode: "point",
    addressKind: "pvz",
    pvzRef: "",
    pvzItem: null,
    addr: {
      label: wh.label,
      fullAddress: wh.fullAddress,
      point: wh.point,
      city,
      sourceId: wh.code,
    },
    query: wh.fullAddress,
    city,
    ...emptyPvzContactFields,
  };
}

export function jobDataToDefaultPlaceState(
  data: JobData,
  city: CityCode,
): PvzSelectionState {
  const address = data.defaultPlaceAddress.trim();
  if (!address) return defaultPickupDefaultPlaceState(city);

  const lat = data.defaultPlaceLatitude;
  const lon = data.defaultPlaceLongitude;
  const hasPoint = lat != null && lon != null;

  return {
    deliveryMode: data.defaultPlaceMode === "courier" ? "courier" : "point",
    addressKind: data.defaultPlaceKind === "custom" ? "custom" : "pvz",
    pvzRef: data.defaultPlacePvzRef ?? "",
    pvzItem: null,
    query: address,
    city,
    addr: hasPoint
      ? {
          label: address,
          fullAddress: address,
          point: { lat, lon },
          city,
        }
      : null,
    ...emptyPvzContactFields,
  };
}

export function defaultPlaceStateToJobPatch(
  state: PvzSelectionState,
): Pick<
  JobData,
  | "defaultPlaceAddress"
  | "defaultPlaceLatitude"
  | "defaultPlaceLongitude"
  | "defaultPlaceMode"
  | "defaultPlaceKind"
  | "defaultPlacePvzRef"
> {
  const address =
    state.deliveryMode === "point"
      ? state.addr?.fullAddress?.trim() ?? ""
      : (state.addr?.fullAddress || state.query).trim();

  const lat = state.addr?.point?.lat ?? null;
  const lon = state.addr?.point?.lon ?? null;

  return {
    defaultPlaceAddress: address,
    defaultPlaceLatitude: lat,
    defaultPlaceLongitude: lon,
    defaultPlaceMode: state.deliveryMode,
    defaultPlaceKind: state.addressKind,
    defaultPlacePvzRef: state.pvzRef,
  };
}
