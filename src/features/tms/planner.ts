import type { TmsCargo, PlanOptions, LoadPlan } from "./model";
import {
  pack3d,
  packageProblem,
  packedVolume,
  packedWeight,
} from "./packing3d";
const EPS = 1e-7;
const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
export function validateOptions(o: PlanOptions): string | null {
  if (!positive(o.vehicle.payload) || !positive(o.vehicle.volume))
    return "Укажите допустимые вес и объём ТС";
  if (
    !o.vehicle.compartments.length ||
    o.vehicle.compartments.some(
      (c) => ![c.length, c.width, c.height].every(positive),
    )
  )
    return "Укажите габариты каждого кузова";
  if (!positive(o.palletLength) || !positive(o.palletWidth))
    return "Укажите размер палеты";
  if (
    !Number.isFinite(o.reservePercent) ||
    o.reservePercent < 0 ||
    o.reservePercent >= 100
  )
    return "Резерв должен быть от 0 до 99%";
  const factor = o.estimatedTopLoadFactor ?? 2;
  if (o.estimatedStacking !== "height" && (!Number.isFinite(factor) || factor < 0 || factor > 20))
    return "Расчётная нагрузка сверху должна быть от 0 до 20 масс нижнего места";
  return null;
}
export function cargoProblem(c: TmsCargo, o: PlanOptions): string | null {
  if (c.readiness !== "ready")
    return c.reason || "Приёмка и отсутствие отправки не подтверждены";
  if (!c.route || c.route.includes("?")) return "Не указан маршрут";
  if (!positive(c.weight) || !positive(c.volume))
    return "Нет фактического веса или объёма";
  if (!c.received) return "Нет даты приёмки";
  if (o.floorCustomers.includes(c.customerId) && !o.packages?.[c.id]?.length) {
    const n = o.pallets[c.id];
    if (!Number.isInteger(n) || n <= 0 || n > 1000)
      return "Укажите количество палет (1–1000)";
  }
  return packageProblem(c, o);
}
/** Repeatable, bounded multi-start packing. Whole consignments; priorities first, FIFO/LIFO with a small lookahead. */
export function planLoad(cargo: TmsCargo[], o: PlanOptions): LoadPlan {
  const error = validateOptions(o);
  if (error) throw new Error(error);
  const routes = new Set(
    cargo.filter((c) => !cargoProblem(c, o)).map((c) => c.route),
  );
  if (routes.size > 1) throw new Error("Для одного ТС выберите один маршрут");
  const reserve = 1 - o.reservePercent / 100;
  const payloadLimit = o.vehicle.payload * reserve;
  const geometricVolume = o.vehicle.compartments.reduce(
    (s, c) => s + c.length * c.width * c.height,
    0,
  );
  const volumeLimit = Math.min(o.vehicle.volume, geometricVolume) * reserve;
  const priority = new Set(o.priority);
  const ordered = cargo
    .filter((c) => o.strictSelection || !cargoProblem(c, o))
    .sort(
      (a, b) =>
        Number(priority.has(b.customerId)) -
          Number(priority.has(a.customerId)) ||
        (o.order === "fifo" ? 1 : -1) * a.received.localeCompare(b.received) ||
        a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
  const layoutCache = new Map<string, ReturnType<typeof pack3d>>();
  const run = (strategy: number): LoadPlan => {
    const result: LoadPlan = {
      selected: [],
      omitted: [],
      placements: [],
      weight: 0,
      volume: 0,
      pallets: 0,
      floorArea: 0,
      payloadLimit,
      volumeLimit,
    };
    const tryFit = (c: TmsCargo, commit: boolean): boolean => {
      const volume = packedVolume(c, o),
        weight = packedWeight(c, o);
      if (
        result.weight + weight > payloadLimit + EPS ||
        result.volume + volume > volumeLimit + EPS
      )
        return false;
      const key = JSON.stringify(
        [...result.selected.map((c) => c.id), c.id].sort(),
      );
      if (!layoutCache.has(key))
        layoutCache.set(
          key,
          pack3d(
            [...result.selected, c].sort((a, b) => a.id.localeCompare(b.id)),
            o,
          ),
        );
      const placements = layoutCache.get(key);
      if (!placements) return false;
      if (commit) {
        result.selected.push(c);
        result.placements = placements;
        result.weight += weight;
        result.volume += volume;
        result.pallets = placements.filter((p) => p.pallet).length;
        result.floorArea = placements
          .filter((p) => p.z < EPS)
          .reduce((s, p) => s + p.length * p.width, 0);
      }
      return true;
    };
    let stoppedAt: TmsCargo | null = null;
    const remaining = [...ordered];
    while (remaining.length) {
      if (o.strictSelection) {
        const next = remaining.shift()!;
        if (cargoProblem(next, o) || !tryFit(next, true)) {
          stoppedAt = next;
          break;
        }
        continue;
      }
      const tier = priority.has(remaining[0].customerId);
      const window = remaining
        .slice(0, strategy === 0 ? 1 : 12)
        .filter((c) => priority.has(c.customerId) === tier);
      let candidate = window[0],
        score = -Infinity;
      for (let i = 0; i < window.length; i++) {
        const c = window[i];
        if (!tryFit(c, false)) continue;
        const w = c.weight! / payloadLimit,
          v = c.volume! / volumeLimit;
        const value =
          (strategy === 1
            ? w
            : strategy === 2
              ? v
              : strategy === 3
                ? Math.min(w, v)
                : strategy === 4
                  ? 1 / (w + v)
                  : w + v) /
          (1 + i * 0.12);
        if (value > score) {
          score = value;
          candidate = c;
        }
      }
      remaining.splice(remaining.indexOf(candidate), 1);
      tryFit(candidate, true);
    }
    const selected = new Set(result.selected.map((c) => c.id));
    result.omitted = cargo
      .filter((c) => !selected.has(c.id))
      .map((c) => ({
        cargo: c,
        reason:
          stoppedAt && c.id !== stoppedAt.id
            ? `Строгий отбор: очередь остановлена на перевозке ${stoppedAt.number}`
            : cargoProblem(c, o) ||
              "Не помещается по весу, габаритам или условиям опоры и штабелирования",
      }));
    return result;
  };
  const score = (p: LoadPlan) => [
    p.selected.filter((c) => priority.has(c.customerId)).length,
    p.weight / payloadLimit + p.volume / volumeLimit,
  ];
  let best = run(0);
  if (o.strictSelection) return best;
  for (let i = 1; i < 6; i++) {
    const p = run(i),
      a = score(p),
      b = score(best);
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1] + EPS)) best = p;
  }
  return best;
}
