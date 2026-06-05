import type { Pool } from "pg";

async function pgTableExists(pool: Pool, tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ reg: string | null }>(`select to_regclass($1) as reg`, [tableName]);
  return Boolean(rows[0]?.reg);
}
import {
  isExtraServiceEnabled,
  type AddressSelection,
  type CityCode,
  type Direction,
  type ExtraServicePayload,
  type MainlineMode,
  type MainlinePayload,
  type QuoteLine,
  type QuoteRequest,
  type QuoteResult,
} from "./types.js";
import {
  DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG,
  mainlineBillableWeightKg,
  summarizePlaces,
} from "./chargeableWeight.js";
import { kmBeyondRing } from "./mkadDistance.js";
import { calcPickupFromMatrix } from "./pickupTariff.js";
import { buildMainlineOptions } from "./calculatorOptions.js";
import { resolveNearestHub } from "./hubResolve.js";
import { loadCalculatorTariffs } from "./tariffStore.js";

function inferCityFromAddress(addr: AddressSelection): CityCode | null {
  if (addr.city === "moscow" || addr.city === "kaliningrad") return addr.city;
  const t = `${addr.fullAddress} ${addr.label}`.toLowerCase();
  if (t.includes("калининград") || t.includes("kaliningrad")) return "kaliningrad";
  if (t.includes("москва") || t.includes("moscow")) return "moscow";
  return null;
}

export function resolveDirection(from: AddressSelection, to: AddressSelection, explicit?: Direction): Direction {
  if (explicit === "mow_kgd" || explicit === "kgd_mow") return explicit;
  const fromCity = inferCityFromAddress(from);
  if (fromCity === "kaliningrad") return "kgd_mow";
  return "mow_kgd";
}

/** Со склада (point) — без заборной логистики. */
export function isPickupLegCharged(req: Pick<QuoteRequest, "fromParty">): boolean {
  return req.fromParty?.mode !== "point";
}

/** На складе (point) — без последней мили. */
export function isLastMileLegCharged(req: Pick<QuoteRequest, "toParty">): boolean {
  return req.toParty?.mode !== "point";
}

function pickMainline(mainlines: MainlinePayload[], direction: Direction, mode: MainlineMode): MainlinePayload | null {
  return (
    mainlines.find((m) => m.direction === direction && m.mode === mode) ??
    mainlines.find((m) => m.direction === direction) ??
    null
  );
}

function calcExtras(
  services: ExtraServicePayload[],
  selected: string[],
  declaredValueRub: number,
): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const set = new Set(selected);
  for (const s of services) {
    if (!isExtraServiceEnabled(s)) continue;
    const on = set.has(s.code) || (s.default_on === true && selected.length === 0);
    if (!on) continue;
    let amount = 0;
    if (s.pricing_type === "percent_of_declared_value") {
      const pct = Number(s.percent) || 0;
      amount = (declaredValueRub * pct) / 100;
      if (s.min_amount_rub != null) amount = Math.max(amount, Number(s.min_amount_rub));
      if (s.max_amount_rub != null) amount = Math.min(amount, Number(s.max_amount_rub));
    } else {
      amount = Number(s.amount_rub) || 0;
    }
    if (amount <= 0) continue;
    lines.push({
      key: `extra:${s.code}`,
      label: s.label,
      amountRub: Math.round(amount * 100) / 100,
    });
  }
  return lines;
}

export async function buildQuote(pool: Pool, req: QuoteRequest): Promise<QuoteResult> {
  const tariffs = await loadCalculatorTariffs(pool);
  const factor = Number(tariffs.settings?.volumetric_factor_kg_m3) || 200;
  const mainlineMinChargeableWeightKg =
    Number(tariffs.settings?.mainline_min_chargeable_weight_kg) || DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG;
  const chargeableBase = summarizePlaces(req.places, factor);
  const mainlineWeightKg = mainlineBillableWeightKg(
    chargeableBase.chargeableWeightKg,
    mainlineMinChargeableWeightKg,
  );
  const chargeable = {
    ...chargeableBase,
    mainlineChargeableWeightKg: mainlineWeightKg,
  };
  const direction = resolveDirection(req.from, req.to, req.direction);
  const warnings: string[] = [];

  const fromCity = inferCityFromAddress(req.from);
  const toCity = inferCityFromAddress(req.to);
  if (!fromCity) warnings.push("Не удалось определить город отправления — используется Москва для забора");
  if (!toCity) warnings.push("Не удалось определить город вручения — используется Калининград для последней мили");

  const pickupCity: CityCode = fromCity === "kaliningrad" ? "kaliningrad" : "moscow";
  const lastMileCity: CityCode = toCity === "moscow" ? "moscow" : "kaliningrad";

  const ringMoscow = await kmBeyondRing(
    pool,
    "moscow",
    req.from.point,
    pickupCity === "moscow" ? req.kmOverride?.moscow : undefined,
  );
  const ringKaliningrad = await kmBeyondRing(
    pool,
    "kaliningrad",
    req.to.point,
    lastMileCity === "kaliningrad" ? req.kmOverride?.kaliningrad : undefined,
  );

  const chargePickup = isPickupLegCharged(req);
  const chargeLastMile = isLastMileLegCharged(req);

  const pickupKm = pickupCity === "moscow" ? ringMoscow.km : ringKaliningrad.km;
  const lastMileKm = lastMileCity === "kaliningrad" ? ringKaliningrad.km : ringMoscow.km;

  const pickupCalc = chargePickup
    ? calcPickupFromMatrix(
        tariffs.pickup,
        pickupCity,
        chargeable.chargeableWeightKg,
        chargeable.volumeM3,
        pickupKm,
      )
    : null;
  const lastMileCalc = chargeLastMile
    ? calcPickupFromMatrix(
        tariffs.lastMile,
        lastMileCity,
        chargeable.chargeableWeightKg,
        chargeable.volumeM3,
        lastMileKm,
      )
    : null;

  const mainline = pickMainline(tariffs.mainline, direction, req.mainlineMode);
  const mainlineRate = Number(mainline?.price_per_kg) || 0;
  const mainlineAmount = mainlineRate * mainlineWeightKg;
  const deliveryDays = Number(mainline?.delivery_days) || 0;

  const hubs: QuoteResult["hubs"] = { from: null, to: null };
  if (await pgTableExists(pool, "haulz_calc_hubs")) {
    const fromHub = await resolveNearestHub(pool, req.from.point, pickupCity);
    const toHub = await resolveNearestHub(pool, req.to.point, lastMileCity);
    if (fromHub) hubs.from = { code: fromHub.code, name: fromHub.name, role: fromHub.role };
    if (toHub) hubs.to = { code: toHub.code, name: toHub.name, role: toHub.role };
  }

  const lines: QuoteLine[] = [];
  if (hubs.from) {
    lines.push({
      key: "hub_from",
      label: `Хаб отправления: ${hubs.from.name} (${hubs.from.code})`,
      amountRub: 0,
      meta: { informational: true },
    });
  }
  if (hubs.to) {
    lines.push({
      key: "hub_to",
      label: `Хаб вручения: ${hubs.to.name} (${hubs.to.code})`,
      amountRub: 0,
      meta: { informational: true },
    });
  }

  if (chargePickup && pickupCalc) {
    lines.push({
      key: "pickup",
      label: `Забор (${pickupCity === "moscow" ? "МКАД" : "КАД"}, ${pickupKm.toFixed(1)} км)`,
      amountRub: Math.round(pickupCalc.total * 100) / 100,
      meta: { tierIndex: pickupCalc.tierIndex, km: pickupKm },
    });
  }

  lines.push({
    key: "mainline",
    label: `Магистраль ${req.mainlineMode === "ferry" ? "паром" : "авто"}`,
    amountRub: Math.round(mainlineAmount * 100) / 100,
    meta: {
      pricePerKg: mainlineRate,
      mode: req.mainlineMode,
      billableWeightKg: mainlineWeightKg,
      minChargeableWeightKg: mainlineMinChargeableWeightKg,
    },
  });

  if (chargeLastMile && lastMileCalc) {
    lines.push({
      key: "last_mile",
      label: `Последняя миля (${lastMileCity === "moscow" ? "МКАД" : "КАД"}, ${lastMileKm.toFixed(1)} км)`,
      amountRub: Math.round(lastMileCalc.total * 100) / 100,
      meta: { tierIndex: lastMileCalc.tierIndex, km: lastMileKm },
    });
  }

  const declared = Number(req.declaredValueRub) || 0;
  const extraLines = calcExtras(tariffs.extras?.services ?? [], req.extraCodes ?? [], declared);
  lines.push(...extraLines);

  const totalRub = Math.round(lines.reduce((s, l) => s + l.amountRub, 0) * 100) / 100;
  const mainlineOptions = buildMainlineOptions(
    tariffs.mainline,
    direction,
    chargeable.chargeableWeightKg,
    mainlineMinChargeableWeightKg,
  );

  return {
    direction,
    chargeable,
    lines,
    totalRub,
    deliveryDays,
    km: { moscow: ringMoscow.km, kaliningrad: ringKaliningrad.km },
    warnings,
    mainlineOptions,
    hubs,
  };
}
