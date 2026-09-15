import { createHash } from "node:crypto";
import type { Job, Route, Resource, Event } from "./model.js";
import { routeWarnings, routeStartAddress } from "./model.js";
import {
  usableRoutingLocation,
  locationDistance,
  type DriverLocation,
} from "./location.js";
import {
  analysisSignature,
  minutes,
  optimise,
  mergedOrder,
  pointValid,
  truckFields,
  type AnalysisResult,
  type Point,
} from "./routeAnalysis.js";
import {
  createRouteProvider,
  mapConcurrent,
  type RouteProvider,
} from "./routeProvider.js";
export type CheckInput = {
  route: Route;
  jobs: Job[];
  resources: Route["snapshot"];
  location?: DriverLocation;
  events: Event[];
};
export type CheckSettings = {
  startAddress?: string;
  windowsConfirmed?: boolean;
};
export function checkSignature(input: CheckInput) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        analysisSignature(input.route, input.jobs, input.resources),
        input.route.status === "started" ? input.location : null,
      ]),
    )
    .digest("hex");
}
async function computeCheckRoute(
  input: CheckInput,
  settings: CheckSettings,
  suppliedProvider?: RouteProvider,
  now = Date.now(),
): Promise<AnalysisResult> {
  const { route, jobs, resources } = input;
  const base: AnalysisResult = {
    status: "gray",
    message: "Недостаточно данных для оценки",
    warnings: [],
    checkedAt: new Date(now).toISOString(),
    signature: checkSignature(input),
    routeVersion: route.version,
    originLabel: "",
    departure: "",
    traffic: "statistics",
  };
  const missing = (...warnings: string[]) => ({ ...base, warnings });
  if (route.status === "completed") return missing("Маршрут уже завершён.");
  if (jobs.length > 20)
    return missing("Проверка поддерживает до 20 точек забора.");
  const remaining = jobs.filter((j) =>
    ["pending", "arrived"].includes(j.status),
  );
  if (!remaining.length) return missing("Нет оставшихся точек для проверки.");
  if (
    jobs.some(
      (j) =>
        j.status === "problem" || (j.status === "partial" && !j.resolution),
    )
  )
    return missing("Сначала решите проблемы и расхождения по забору.");
  if (remaining.some((j, i) => j.status === "arrived" && i !== 0))
    return missing(
      "Начатая точка должна быть первой среди оставшихся. Завершите её или проверьте порядок.",
    );
  const depot = resources.depot,
    driver = resources.driver,
    vehicle = resources.vehicle;
  if (!depot?.data.address || !driver || !vehicle)
    return missing("Укажите водителя, автомобиль и адрес склада HAULZ.");
  if (
    remaining.some(
      (j) =>
        !j.data.address ||
        !Number.isFinite(minutes(j.data.windowFrom)) ||
        !Number.isFinite(minutes(j.data.windowTo)) ||
        minutes(j.data.windowFrom) >= minutes(j.data.windowTo) ||
        !Number.isFinite(j.data.serviceMinutes) ||
        j.data.serviceMinutes < 0,
    )
  )
    return missing(
      "Заполните адреса, окна забора и длительность погрузки для каждой точки.",
    );
  if (
    [
      depot.data.from,
      depot.data.to,
      driver.data.from,
      driver.data.to,
      vehicle.data.from,
      vehicle.data.to,
      route.start_time,
    ].some((x) => !Number.isFinite(minutes(x)))
  )
    return missing(
      "Заполните рабочее время склада, водителя, автомобиля и старт рейса.",
    );
  const offset = route.city === "moscow" ? 3 : 2;
  const midnight = Date.parse(`${route.date}T00:00:00+0${offset}:00`);
  let departure = minutes(route.start_time);
  if (route.status === "started") departure = (now - midnight) / 60000;
  if (departure < 0 || departure >= 1440)
    return missing("Для выполняемого маршрута проверяйте текущую дату города.");
  const departureEpoch = midnight + departure * 60000;
  if (departureEpoch < now - 5 * 60000 && route.status !== "started")
    return missing(
      "Время старта уже прошло. Исправьте его в черновике или начните рейс перед оценкой остатка.",
    );
  base.departure = new Date(departureEpoch).toISOString();
  base.traffic =
    Math.abs(departureEpoch - now) <= 15 * 60000 ? "jam" : "statistics";
  const warnings: string[] = [];
  if (!settings.windowsConfirmed)
    warnings.push(
      "Подтвердите, что окна забора учитывают часы работы, перерывы и выходные отправителей. Свободный текст графика автоматически не разбирается.",
    );
  const truck: Record<string, unknown> = {};
  for (const [field, label, param] of truckFields) {
    const value = Number(vehicle.data[field]);
    if (!Number.isFinite(value) || value <= 0)
      warnings.push(`В автомобиле не заполнено: ${label}.`);
    else truck[param] = value;
  }
  for (const [field, param] of [
    ["truckDangerous", "dangerous_cargo"],
    ["truckExplosive", "explosive_cargo"],
  ]) {
    if (!["yes", "no"].includes(vehicle.data[field]))
      warnings.push(
        "В автомобиле укажите наличие опасного и взрывоопасного груза.",
      );
    else truck[param] = vehicle.data[field] === "yes";
  }
  const passIds = (vehicle.data.truckPassIds || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  if (passIds.some((x) => !Number.isInteger(x) || x < 0))
    return missing(
      "В автомобиле указаны некорректные идентификаторы пропусков 2ГИС.",
    );
  if (passIds.length) truck.pass_zone_pass_ids = passIds;
  const capacities = routeWarnings(
    jobs.filter((j) => !["resolved", "deposited"].includes(j.status)),
    vehicle,
  );
  warnings.push(...capacities);
  if (!vehicle.data.capacityKg || !vehicle.data.capacityM3)
    warnings.push(
      "Укажите грузоподъёмность и объём автомобиля для проверки вместимости.",
    );
  const overloaded =
    capacities.some((w) => w.startsWith("Превышен")) ||
    Number(truck.mass) > Number(truck.max_perm_mass);
  if (Number(truck.mass) > Number(truck.max_perm_mass))
    warnings.push("Полная масса превышает разрешённую максимальную массу ТС.");
  let origin: Point | undefined,
    originAddress = (settings.startAddress || "").trim();
  if (originAddress.length > 1000)
    return missing("Слишком длинный адрес старта.");
  if (originAddress)
    base.originLabel = `Выбранный адрес старта: ${originAddress}`;
  else if (route.status === "started") {
    const fix = usableRoutingLocation(input.location, now);
    if (fix) {
      origin = { lat: fix.latitude, lon: fix.longitude };
      base.originLabel = `GPS водителя, ${new Date(fix.measured_at).toISOString()}`;
    } else {
      const last = [...input.events]
        .filter(
          (e) =>
            e.route_id === route.id &&
            ["Прибыл на точку", "Груз забран", "Проблема на точке"].includes(
              e.action,
            ),
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0];
      const job = jobs.find((j) => j.id === last?.job_id);
      if (!job)
        return missing(
          "GPS ненадёжен или устарел, отмеченных остановок нет. Введите адрес старта для расчёта.",
        );
      originAddress = job.data.address;
      const point = {
        lat: job.data.latitude as number,
        lon: job.data.longitude as number,
      };
      if (pointValid(point)) origin = point;
      base.originLabel = `Ориентир: последняя отмеченная остановка — ${originAddress} (${new Date(last.created_at).toISOString()})`;
      warnings.push(
        "Расчёт от адреса последней отмеченной остановки: текущее положение водителя неизвестно. Уточните адрес старта.",
      );
    }
  } else {
    originAddress = routeStartAddress(route, depot);
    base.originLabel = route.snapshot.start?.mode === "address"
      ? `Место старта маршрута: ${originAddress}`
      : `Старт со склада HAULZ: ${originAddress}`;
  }
  let owned: ReturnType<typeof createRouteProvider> | undefined;
  try {
    const provider =
      suppliedProvider || (owned = createRouteProvider()).provider;
    const resolve = async (address: string, point?: Point) => {
      const result = pointValid(point)
        ? point
        : await provider.geocode(address);
      if (!pointValid(result))
        throw new Error(
          `Адрес не найден однозначно: ${address}. Уточните адрес или координаты точки.`,
        );
      const center =
        route.city === "moscow"
          ? { latitude: 55.75, longitude: 37.62 }
          : { latitude: 54.71, longitude: 20.51 };
      if (
        locationDistance(center, {
          latitude: result.lat,
          longitude: result.lon,
        }) > 250000
      )
        throw new Error(
          `Точка далеко от выбранного города: ${address}. Проверьте координаты.`,
        );
      return result;
    };
    const definitions = [
      {
        id: "origin",
        address: originAddress || base.originLabel,
        point: origin,
      },
      ...remaining.map((j) => ({
        id: j.id,
        address: j.data.address,
        point: {
          lat: j.data.latitude as number,
          lon: j.data.longitude as number,
        },
      })),
      { id: "depot", address: depot.data.address, point: undefined },
    ];
    const points = await mapConcurrent(definitions, async (d) => ({
      ...d,
      point: await resolve(d.address, d.point),
    }));
    const options = {
      truck,
      traffic: base.traffic,
      utc: Math.floor(departureEpoch / 1000),
    };
    const matrix = await provider.matrix(
      points.map((p) => p.point),
      options,
    );
    const scores = optimise({
      jobs: remaining,
      matrix,
      departure,
      depotFrom: minutes(depot.data.from),
      depotTo: minutes(depot.data.to),
      shiftTo: Math.min(minutes(driver.data.to), minutes(vehicle.data.to)),
    });
    const early =
      departure <
      Math.max(minutes(driver.data.from), minutes(vehicle.data.from));
    if (early)
      warnings.push("Старт до начала смены водителя или работы автомобиля.");
    // Detailed routes are for map comparison and checking provider restriction warnings.
    const geometry = async (ids: string[]) => {
      try {
        const result = await provider.geometry(
          [
            points[0].point,
            ...ids.map((id) => points.find((p) => p.id === id)!.point),
            points[points.length - 1].point,
          ],
          options,
        );
        warnings.push(...result.warnings);
        return result.lines;
      } catch {
        warnings.push(
          "Не удалось подтвердить геометрию и ограничения проезда. Карта сравнения недоступна для одного из вариантов.",
        );
        return undefined;
      }
    };
    const [currentGeometry, proposedGeometry] = await Promise.all([
      scores.current.unreachable
        ? Promise.resolve(undefined)
        : geometry(scores.current.ids),
      scores.proposed && !scores.proposed.unreachable
        ? geometry(scores.proposed.ids)
        : Promise.resolve(undefined),
    ]);
    const risk =
      overloaded ||
      early ||
      scores.current.unreachable > 0 ||
      scores.current.lateStops > 0 ||
      scores.current.depotLate > 0 ||
      scores.current.shiftLate > 0;
    const status = risk
      ? "red"
      : warnings.length
        ? "gray"
        : scores.proposed
          ? "amber"
          : "green";
    return {
      ...base,
      ...scores,
      status,
      message:
        status === "red"
          ? "Есть риск опоздания или нарушения ограничений"
          : status === "gray"
            ? "Оценка неполная — проверьте замечания"
            : status === "amber"
              ? "Найден более выгодный порядок точек"
              : "Все окна соблюдены, существенного улучшения не найдено",
      warnings: [...new Set(warnings)],
      points,
      ids: scores.proposed ? mergedOrder(jobs, scores.proposed.ids) : undefined,
      currentGeometry,
      proposedGeometry,
    };
  } catch (error) {
    return {
      ...base,
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : "Расчёт 2ГИС недоступен",
      ],
    };
  } finally {
    owned?.dispose();
  }
}

const recentChecks = new Map<
  string,
  { expires: number; promise: Promise<AnalysisResult> }
>();
/** Coalesce repeats and reuse results for at most five minutes without storing credentials. */
export function checkRoute(
  input: CheckInput,
  settings: CheckSettings,
  provider?: RouteProvider,
  now = Date.now(),
): Promise<AnalysisResult> {
  if (provider) return computeCheckRoute(input, settings, provider, now);
  for (const [key, value] of recentChecks)
    if (value.expires <= now) recentChecks.delete(key);
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        checkSignature(input),
        settings,
        input.location,
        input.events,
        Math.floor(now / 300000),
      ]),
    )
    .digest("hex");
  const cached = recentChecks.get(key);
  if (cached) return cached.promise;
  const promise = computeCheckRoute(input, settings, undefined, now).then(
    (result) => {
      if (!result.current) recentChecks.delete(key);
      return result;
    },
    (error) => {
      recentChecks.delete(key);
      throw error;
    },
  );
  if (recentChecks.size >= 25)
    recentChecks.delete(recentChecks.keys().next().value!);
  recentChecks.set(key, { expires: now + 300000, promise });
  return promise;
}
