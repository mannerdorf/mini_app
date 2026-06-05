import type {
  CityCode,
  ExtraServicePayload,
  ExtrasBlockPayload,
  MainlinePayload,
  PickupMatrixPayload,
  PickupTier,
  SettingsPayload,
} from "./types.js";

export function formatTariffDateRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return iso;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(y, mo - 1, d),
  );
}

const CITY_RU: Record<CityCode, string> = {
  moscow: "Москва",
  kaliningrad: "Калининград",
};

const DIRECTION_RU: Record<string, string> = {
  mow_kgd: "Москва → Калининград",
  kgd_mow: "Калининград → Москва",
};

function rub(n: number): string {
  return `${Number(n).toLocaleString("ru-RU")} ₽`;
}

function describeTierRange(tiers: PickupTier[]): string {
  if (tiers.length === 0) return "нет тарифных ступеней";
  const first = tiers[0];
  const last = tiers[tiers.length - 1];
  return `${tiers.length} ступен${tiers.length === 1 ? "ь" : tiers.length < 5 ? "и" : "ей"} (до ${last.weight_max_kg} кг / ${last.volume_max_m3} м³)`;
}

function describePickupCity(city: CityCode, tiers: PickupTier[] | undefined): string {
  const name = CITY_RU[city];
  if (!tiers?.length) return `${name}: тарифы не заданы`;
  const sample = tiers[0];
  return `${name}: ${describeTierRange(tiers)} — от ${rub(sample.city_fee)} по городу, ${sample.per_km} ₽/км`;
}

function describeExtraService(s: ExtraServicePayload): string {
  const off = s.enabled === false ? " · выключена" : "";
  const def = s.default_on ? " · по умолчанию включена" : "";
  let price = "";
  if (s.pricing_type === "percent_of_declared_value") {
    price = `${s.percent ?? 0}% от объявленной стоимости`;
    if (s.min_amount_rub != null) price += `, мин. ${rub(s.min_amount_rub)}`;
    if (s.max_amount_rub != null) price += `, макс. ${rub(s.max_amount_rub)}`;
  } else {
    price = rub(Number(s.amount_rub) || 0);
  }
  return `${s.label || s.code}: ${price}${off}${def}`;
}

function describeMainline(p: MainlinePayload): string {
  const dir = DIRECTION_RU[p.direction] ?? p.direction;
  const mode = p.mode === "ferry" ? "паром" : "авто";
  return `${dir}, ${mode}: ${p.price_per_kg} ₽/кг, срок ~${p.delivery_days} дн.`;
}

/** Краткое описание версии тарифа простым языком (без JSON). */
export function describeTariffVersionPayload(
  tariffCode: string,
  block: string,
  payload: unknown,
): string[] {
  if (payload == null) return ["Пустая версия — данных нет"];

  const code = String(tariffCode || "").toLowerCase();
  const blk = String(block || "").toLowerCase();

  if (blk === "extras" || code === "calc_extras") {
    const services = (payload as ExtrasBlockPayload)?.services;
    if (!Array.isArray(services) || services.length === 0) {
      return ["Список дополнительных услуг пуст"];
    }
    const enabled = services.filter((s) => s.enabled !== false);
    const lines = [`Всего услуг: ${services.length}, активных: ${enabled.length}`];
    for (const s of services.slice(0, 8)) {
      lines.push(describeExtraService(s));
    }
    if (services.length > 8) {
      lines.push(`… и ещё ${services.length - 8} услуг`);
    }
    return lines;
  }

  if (blk === "settings" || code === "calc_settings") {
    const settings = payload as SettingsPayload;
    const factor = Number(settings?.volumetric_factor_kg_m3) || 200;
    const mainlineMin = Number(settings?.mainline_min_chargeable_weight_kg) || 20;
    return [
      `Объёмный коэффициент для расчёта веса: ${factor} кг/м³`,
      `Минимальный платный вес магистрали: ${mainlineMin} кг`,
    ];
  }

  if (blk === "mainline" || code.startsWith("mainline_")) {
    const p = payload as MainlinePayload;
    if (p?.price_per_kg != null && p?.delivery_days != null) {
      return [describeMainline(p)];
    }
    return ["Настройки магистрального тарифа сохранены"];
  }

  if (code === "pickup_matrix" || code === "last_mile_matrix" || blk === "pickup" || blk === "last_mile") {
    const p = payload as PickupMatrixPayload;
    const scope =
      p?.scope === "last_mile" || code === "last_mile_matrix"
        ? "Последняя миля"
        : "Забор";
    const cities = p?.cities;
    if (!cities) return [`${scope}: тарифная сетка сохранена`];
    return [
      `${scope}:`,
      describePickupCity("moscow", cities.moscow?.tiers),
      describePickupCity("kaliningrad", cities.kaliningrad?.tiers),
    ];
  }

  return ["Сохранены настройки тарифа"];
}

export function tariffSetSelectLabel(set: { code: string; name: string; block: string }): string {
  const code = String(set.code || "");
  const name = String(set.name || "").trim();
  if (name && name !== code) return name;
  if (code === "pickup_matrix") return "Забор (Москва и Калининград)";
  if (code === "last_mile_matrix") return "Последняя миля";
  if (code === "calc_extras") return "Дополнительные услуги";
  if (code === "calc_settings") return "Настройки калькулятора";
  return name || code;
}
