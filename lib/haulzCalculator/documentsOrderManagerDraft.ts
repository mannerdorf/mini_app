import type { HaulzCalculatorFormState } from "./calculatorDraft.js";
import type { OrderLegAddressKind } from "./orderAddressKind.js";
import type {
  AddressSelection,
  DeliveryParty,
  Direction,
  MainlineMode,
  ParcelPlace,
} from "./types.js";

export function buildDocumentsOrderFormState(input: {
  from: AddressSelection;
  to: AddressSelection;
  fromParty?: DeliveryParty;
  toParty?: DeliveryParty;
  fromAddressKind?: OrderLegAddressKind;
  toAddressKind?: OrderLegAddressKind;
  customerInn: string;
  customerName?: string;
  places: ParcelPlace[];
  mainlineMode: MainlineMode;
  direction?: Direction;
  declaredValueRub: number;
  extraCodes: string[];
  dataZabora: string;
}): HaulzCalculatorFormState {
  const fromMode = input.fromParty?.mode === "point" ? "point" : "courier";
  const toMode = input.toParty?.mode === "point" ? "point" : "courier";

  return {
    fromQuery: input.from.label || input.from.fullAddress,
    toQuery: input.to.label || input.to.fullAddress,
    from: input.from,
    to: input.to,
    fromMode,
    toMode,
    fromPhone: input.fromParty?.phone ?? "",
    toPhone: input.toParty?.phone ?? "",
    customerInn: input.customerInn,
    customerCompanyName: input.customerName ?? "",
    fromInn: input.fromParty?.inn ?? "",
    toInn: input.toParty?.inn ?? "",
    fromCompanyName: input.fromParty?.companyName ?? input.customerName ?? "",
    toCompanyName: input.toParty?.companyName ?? "",
    fromName: input.fromParty?.fullName ?? "",
    toName: input.toParty?.fullName ?? "",
    places: input.places,
    activePresetIdx: {},
    declaredValue: String(input.declaredValueRub || ""),
    mainlineMode: input.mainlineMode,
    directionOverride: input.direction ?? null,
    extraCodes: input.extraCodes,
    dataZabora: input.dataZabora,
    fromAddressKind: input.fromAddressKind,
    toAddressKind: input.toAddressKind,
  };
}

export function documentsOrderManagerDraftTitle(from: AddressSelection, to: AddressSelection): string {
  const fromLabel = from.label || from.fullAddress || "—";
  const toLabel = to.label || to.fullAddress || "—";
  return `[ЛК] ${fromLabel} → ${toLabel}`;
}
