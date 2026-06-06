import type { TariffBasis } from "./tariffBasisFootnote.js";

export type { TariffBasis };

export type CityCode = "moscow" | "kaliningrad";
export type Direction = "mow_kgd" | "kgd_mow";
export type MainlineMode = "ferry" | "auto";

export type GeoPoint = { lat: number; lon: number };

export type AddressSelection = {
  label: string;
  fullAddress: string;
  point: GeoPoint;
  city?: CityCode;
  sourceId?: string;
};

export type ParcelPlace = {
  weightKg: number;
  volumeM3: number;
};

export type PickupTier = {
  weight_max_kg: number;
  volume_max_m3: number;
  city_fee: number;
  per_km: number;
  load_minutes?: number;
  overtime_rub_per_hour?: number;
};

export type PickupCityPayload = {
  tiers: PickupTier[];
  ring_label?: string;
};

export type PickupMatrixPayload = {
  scope: "pickup" | "last_mile";
  note?: string;
  cities: Record<CityCode, PickupCityPayload>;
};

export type MainlinePayload = {
  mode: MainlineMode;
  price_per_kg: number;
  direction: Direction;
  delivery_days: number;
};

export type SettingsPayload = {
  volumetric_factor_kg_m3?: number;
  /** Минимальный платный вес для расчёта магистрали, кг */
  mainline_min_chargeable_weight_kg?: number;
};

export type ExtraServicePayload = {
  code: string;
  label: string;
  description?: string;
  /** false — услуга скрыта в калькуляторе и не участвует в расчёте */
  enabled?: boolean;
  default_on?: boolean;
  applies_to?: string;
  pricing_type: "fixed" | "percent_of_declared_value";
  amount_rub?: number;
  percent?: number;
  min_amount_rub?: number;
  max_amount_rub?: number;
};

export function isExtraServiceEnabled(s: ExtraServicePayload): boolean {
  return s.enabled !== false;
}

export type ExtrasBlockPayload = {
  services: ExtraServicePayload[];
};

export type TariffSetRow = {
  id: number;
  code: string;
  name: string;
  block: string;
  direction: string | null;
};

export type TariffVersionRow = {
  id: number;
  tariff_set_id: number;
  effective_from: string;
  payload: unknown;
  comment: string | null;
  created_by: string | null;
  created_at: string;
};

export type RingExitRow = {
  id: number;
  city_code: CityCode;
  code: string | null;
  name: string;
  lat: number;
  lon: number;
  active: boolean;
  sort_order: number;
};

export type ChargeableSummary = {
  actualWeightKg: number;
  volumeM3: number;
  volumeWeightKg: number;
  chargeableWeightKg: number;
  /** Платный вес для магистрали с учётом минимума из настроек */
  mainlineChargeableWeightKg?: number;
  volumetricFactor: number;
};

export type QuoteLine = {
  key: string;
  label: string;
  amountRub: number;
  meta?: Record<string, unknown>;
};

export type MainlineOption = {
  mode: MainlineMode;
  label: string;
  pricePerKg: number;
  deliveryDays: number;
  estimatedRub: number;
  billableWeightKg: number;
  direction: Direction;
};

export type CalculatorOptions = {
  asOfDate: string;
  direction: Direction;
  volumetricFactor: number;
  mainlineMinChargeableWeightKg: number;
  mainlineOptions: MainlineOption[];
  extras: ExtraServicePayload[];
  pickupNote?: string;
};

export type DeliveryParty = {
  mode: "courier" | "point";
  inn?: string;
  phone?: string;
  /** ФИО контактного лица */
  fullName?: string;
  /** Полное наименование организации (по ИНН / вручную) */
  companyName?: string;
};

export type HubSummary = {
  code: string;
  name: string;
  role: CityCode;
};

export type QuoteResult = {
  direction: Direction;
  chargeable: ChargeableSummary;
  lines: QuoteLine[];
  totalRub: number;
  deliveryDays: number;
  km: { moscow: number; kaliningrad: number };
  warnings: string[];
  mainlineOptions?: MainlineOption[];
  quoteId?: number;
  hubs?: { from: HubSummary | null; to: HubSummary | null };
  /** Согласованный тариф и договор действующего партнёра */
  tariffBasis?: TariffBasis;
  tariffBasisFootnote?: string;
};

export type QuoteRequest = {
  from: AddressSelection;
  to: AddressSelection;
  places: ParcelPlace[];
  mainlineMode: MainlineMode;
  direction?: Direction;
  declaredValueRub?: number;
  extraCodes?: string[];
  kmOverride?: { moscow?: number; kaliningrad?: number };
  saveQuote?: boolean;
  fromParty?: DeliveryParty;
  toParty?: DeliveryParty;
  /** Заказчик — по его ИНН подставляется согласованный тариф */
  customerParty?: DeliveryParty;
};
