import type { TmsCargo, PlanOptions, LoadPlan } from "./model";
import { packFloor, type FloorRect } from "./packing";
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
  return null;
}
export function cargoProblem(c: TmsCargo, o: PlanOptions): string | null {
  if (c.readiness !== "ready")
    return c.reason || "Приёмка и отсутствие отправки не подтверждены";
  if (!c.route || c.route.includes("?")) return "Не указан маршрут";
  if (!positive(c.weight) || !positive(c.volume))
    return "Нет фактического веса или объёма";
  if (!c.received) return "Нет даты приёмки";
  if (o.floorCustomers.includes(c.customerId)) {
    const n = o.pallets[c.id];
    if (!Number.isInteger(n) || n <= 0 || n > 1000)
      return "Укажите количество палет (1–1000)";
  }
  return null;
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
  const priority = new Set(o.priority),
    floor = new Set(o.floorCustomers);
  const ordered = cargo
    .filter((c) => o.strictSelection || !cargoProblem(c, o))
    .sort(
      (a, b) =>
        Number(priority.has(b.customerId)) -
          Number(priority.has(a.customerId)) ||
        (o.order === "fifo" ? 1 : -1) * a.received.localeCompare(b.received) ||
        a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
  const run = (strategy: number): LoadPlan => {
    const bins = o.vehicle.compartments.map((c) => ({
      ...c,
      free: [{ x: 0, y: 0, length: c.length, width: c.width }] as FloorRect[],
    }));
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
      if (
        result.weight + c.weight! > payloadLimit + EPS ||
        result.volume + c.volume! > volumeLimit + EPS
      )
        return false;
      const count = floor.has(c.customerId) ? o.pallets[c.id] : 0;
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        if (
          count &&
          c.volume! > count * o.palletLength * o.palletWidth * b.height + EPS
        )
          continue;
        const layout = packFloor(
          b.free,
          count || 1,
          count ? o.palletLength : c.volume! / (b.width * b.height),
          count ? o.palletWidth : b.width,
          Boolean(count),
        );
        if (!layout) continue;
        if (commit) {
          const placements = layout.placements.map((p) => ({
            ...p,
            cargoId: c.id,
            compartment: i,
            pallet: Boolean(count),
          }));
          b.free = layout.free;
          result.placements.push(...placements);
          result.selected.push(c);
          result.weight += c.weight!;
          result.volume += c.volume!;
          result.pallets += count;
          result.floorArea += placements.reduce(
            (s, p) => s + p.length * p.width,
            0,
          );
        }
        return true;
      }
      return false;
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
              "Не помещается в оставшиеся вес, объём или площадь пола",
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
