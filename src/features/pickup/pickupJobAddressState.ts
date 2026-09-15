import type { CityCode } from "../../../lib/haulzCalculator/types";
import type { JobData } from "../../../lib/pickup/model";
import {
  emptyPvzContactFields,
  type PvzSelectionState,
} from "../documents/orders/DocumentsOrderPvzSection";

export function defaultPickupAddressState(city: CityCode): PvzSelectionState {
  return {
    deliveryMode: "courier",
    addressKind: "pvz",
    pvzRef: "",
    pvzItem: null,
    addr: null,
    query: "",
    city,
    ...emptyPvzContactFields,
  };
}

export function jobDataToPickupAddressState(
  data: JobData,
  city: CityCode,
): PvzSelectionState {
  const address = (data.address ?? "").trim();
  if (!address) return defaultPickupAddressState(city);

  const lat = data.latitude;
  const lon = data.longitude;
  const hasPoint = lat != null && lon != null;

  return {
    deliveryMode: data.deliveryMode === "point" ? "point" : "courier",
    addressKind: data.addressKind === "custom" ? "custom" : "pvz",
    pvzRef: data.pvzRef ?? "",
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
    phone: data.contacts[0]?.phone ?? "",
    contactName: data.contacts[0]?.name ?? "",
  };
}

export function pickupAddressStateToJobPatch(
  state: PvzSelectionState,
): Pick<
  JobData,
  "address" | "latitude" | "longitude" | "deliveryMode" | "addressKind" | "pvzRef"
> & {
  contactPhone?: string;
  contactName?: string;
} {
  const address =
    state.deliveryMode === "point"
      ? state.addr?.fullAddress?.trim() ?? ""
      : (state.addr?.fullAddress || state.query || "").trim();

  const lat = state.addr?.point?.lat ?? null;
  const lon = state.addr?.point?.lon ?? null;

  return {
    address,
    latitude: lat,
    longitude: lon,
    deliveryMode: state.deliveryMode,
    addressKind: state.addressKind,
    pvzRef: state.pvzRef,
    contactPhone: (state.phone ?? "").trim() || undefined,
    contactName: (state.contactName ?? "").trim() || undefined,
  };
}
