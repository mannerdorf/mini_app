import type { TmsCargo, PlanOptions, PackageGroup, Placement } from "./model";
import {
  floorCandidates,
  subtract,
  mergeFloorRects,
  type FloorRect,
} from "./packing";
const EPS = 1e-6;
export function packageGroups(
  c: TmsCargo,
  o: PlanOptions,
): { groups: PackageGroup[]; estimated: boolean } {
  if (o.packages?.[c.id]?.length)
    return { groups: o.packages[c.id], estimated: false };
  const pallet = o.floorCustomers.includes(c.customerId);
  const count = pallet
    ? o.pallets[c.id]
    : Number.isInteger(c.places) && c.places! > 0
      ? c.places!
      : 1;
  const v = (c.volume ?? 0) / count;
  const weight = (c.weight ?? 0) / count;
  const factor = o.estimatedTopLoadFactor ?? 2;
  const byHeight = o.estimatedStacking === "height";
  // An explicit estimate, never a claim about actual individual package dimensions.
  const width = pallet
    ? o.palletWidth
    : Math.min(Math.cbrt(v), ...o.vehicle.compartments.map((b) => b.width));
  const height = pallet
    ? v / (o.palletLength * width)
    : Math.min(Math.cbrt(v), ...o.vehicle.compartments.map((b) => b.height));
  const length = pallet ? o.palletLength : v / (width * height);
  return {
    estimated: true,
    groups: [
      {
        count,
        length,
        width,
        height,
        weight,
        pallet,
        floorOnly: pallet,
        stackable: byHeight || factor > 0,
        // Vehicle payload is only a numeric bound here, not verified packaging strength.
        maxTopLoad: byHeight ? o.vehicle.payload : weight * factor,
        rotate: true,
      },
    ],
  };
}
export function packageProblem(c: TmsCargo, o: PlanOptions): string | null {
  const { groups, estimated } = packageGroups(c, o);
  if (estimated && o.requireDimensions)
    return "Введите габариты и массу грузовых мест";
  if (
    groups.some(
      (g) =>
        !Number.isInteger(g.count) ||
        g.count < 1 ||
        g.count > 1000 ||
        ![g.length, g.width, g.height, g.weight].every(
          (n) => Number.isFinite(n) && n > 0,
        ) ||
        !Number.isFinite(g.maxTopLoad) ||
        g.maxTopLoad < 0,
    )
  )
    return "Проверьте размеры, количество, массу и нагрузку сверху";
  if (groups.reduce((s, g) => s + g.count, 0) > 1000)
    return "Не более 1000 грузовых мест в одной перевозке";
  if (!estimated) {
    const w = groups.reduce((s, g) => s + g.weight * g.count, 0);
    if (Math.abs(w - c.weight!) > Math.max(0.1, c.weight! * 0.01))
      return "Масса мест должна совпадать с массой перевозки (допуск 1%)";
  }
  return null;
}
export const packedVolume = (c: TmsCargo, o: PlanOptions) =>
  Math.max(
    c.volume ?? 0,
    packageGroups(c, o).groups.reduce(
      (s, g) => s + g.count * g.length * g.width * g.height,
      0,
    ),
  );
export const packedWeight = (c: TmsCargo, o: PlanOptions) =>
  Math.max(
    c.weight ?? 0,
    packageGroups(c, o).groups.reduce((s, g) => s + g.count * g.weight, 0),
  );
type Unit = PackageGroup & {
  cargoId: string;
  unit: string;
  estimated: boolean;
  density: number;
};
type Surface = { parents: string[]; z: number; free: FloorRect[] };
type Bin = { surfaces: Surface[]; placements: Placement[] };
export type PackingStrategy =
  "density-low" | "density-compact" | "area-compact";
/** Upright packing with full coplanar support and cumulative contact-area load distribution. */
export function pack3d(
  cargo: TmsCargo[],
  o: PlanOptions,
  strategy: PackingStrategy = "density-low",
): Placement[] | null {
  const bins: Bin[] = o.vehicle.compartments.map((b) => ({
    placements: [],
    surfaces: [
      {
        parents: [],
        z: 0,
        free: [{ x: 0, y: 0, length: b.length, width: b.width }],
      },
    ],
  }));
  // Selection remains shipment-atomic in the planner. Placement mixes the
  // individual places of all selected shipments; customer identity is irrelevant.
  const units: Unit[] = cargo.flatMap((c) => {
    const { groups, estimated } = packageGroups(c, o);
    return groups.flatMap((g, i) =>
      Array.from({ length: g.count }, (_, j) => ({
        ...g,
        pallet: g.pallet || o.floorCustomers.includes(c.customerId),
        floorOnly:
          g.floorOnly ||
          (g.pallet && !g.palletStacking) ||
          o.floorCustomers.includes(c.customerId),
        cargoId: c.id,
        unit: `${c.id}/${i}/${j}`,
        estimated,
        density: g.weight / (g.length * g.width * g.height),
      })),
    );
  });
  units.sort(
    (a, b) =>
      Number(b.floorOnly) - Number(a.floorOnly) ||
      (strategy === "area-compact"
        ? b.length * b.width - a.length * a.width
        : 0) ||
      b.density - a.density ||
      b.weight - a.weight ||
      Number(b.stackable) - Number(a.stackable) ||
      a.unit.localeCompare(b.unit, undefined, { numeric: true }),
  );
  if (units.length > 2000)
    throw new Error(
      "Для 3D-расчёта выберите до 2000 мест. Сузьте период или маршрут.",
    );
  const byUnit = new Map<string, Placement>();
  type Candidate = {
    bi: number;
    si: number;
    z: number;
    rect: FloorRect;
    loads: Map<string, number>;
    supports: { unit: string; share: number }[];
  };
  // Compact variants favour a smaller occupied length, then lower placement.
  const compactCost = (bin: number, end: number, z: number) =>
    bin * 10000 + end * 100 + z;
  for (const u of units) {
    let best: Candidate | null = null;
    for (let bi = 0; bi < bins.length; bi++) {
      const bin = bins[bi],
        bounds = o.vehicle.compartments[bi];
      for (let si = 0; si < bin.surfaces.length; si++) {
        const s = bin.surfaces[si];
        if (
          !s.free.length ||
          (u.floorOnly && s.z > EPS) ||
          s.z + u.height > bounds.height + EPS ||
          (strategy === "density-low" && best && s.z > best.z + EPS)
        )
          continue;
        if (
          strategy !== "density-low" &&
          best &&
          compactCost(
            bi,
            Math.min(...s.free.map((r) => r.x)) +
              (u.rotate ? Math.min(u.length, u.width) : u.length),
            s.z,
          ) >=
            compactCost(best.bi, best.rect.x + best.rect.length, best.z) - EPS
        )
          continue;
        // A merged face may contain both weak and strong supports. Keep their
        // original anchors so a rejected position does not hide a valid neighbour.
        const free = [...s.free];
        for (const unit of s.parents) {
          const p = byUnit.get(unit)!;
          for (const r of s.free)
            if (
              p.x >= r.x - EPS &&
              p.y >= r.y - EPS &&
              p.x < r.x + r.length - EPS &&
              p.y < r.y + r.width - EPS
            )
              free.push({
                x: p.x,
                y: p.y,
                length: r.x + r.length - p.x,
                width: r.y + r.width - p.y,
              });
        }
        const candidates = floorCandidates(free, u.length, u.width, u.rotate);
        if (s.z > EPS) candidates.sort((a, b) => a.x - b.x || a.y - b.y);
        for (const rect of candidates) {
          if (
            strategy !== "density-low" &&
            best &&
            compactCost(bi, rect.x + rect.length, s.z) >=
              compactCost(best.bi, best.rect.x + best.rect.length, best.z) - EPS
          )
            continue;
          if (
            bin.placements.some(
              (p) =>
                rect.x < p.x + p.length - EPS &&
                rect.x + rect.length > p.x + EPS &&
                rect.y < p.y + p.width - EPS &&
                rect.y + rect.width > p.y + EPS &&
                s.z < p.z + p.height - EPS &&
                s.z + u.height > p.z + EPS,
            )
          )
            continue;
          const area = rect.length * rect.width;
          const supports = s.parents.flatMap((unit) => {
            const p = byUnit.get(unit)!;
            const contact =
              Math.max(
                0,
                Math.min(rect.x + rect.length, p.x + p.length) -
                  Math.max(rect.x, p.x),
              ) *
              Math.max(
                0,
                Math.min(rect.y + rect.width, p.y + p.width) -
                  Math.max(rect.y, p.y),
              );
            return contact > EPS ? [{ unit, share: contact / area }] : [];
          });
          if (
            s.z > EPS &&
            Math.abs(supports.reduce((n, p) => n + p.share, 0) - 1) > EPS
          )
            continue;
          if (
            u.pallet &&
            supports.some(({ unit }) => {
              const p = byUnit.get(unit)!;
              return !u.palletStacking || !p.pallet || !p.palletStacking;
            })
          )
            continue;
          const loads = new Map<string, number>();
          const distribute = (unit: string, load: number) => {
            loads.set(unit, (loads.get(unit) ?? 0) + load);
            const p = byUnit.get(unit)!;
            for (const support of p.supports ??
              (p.support ? [{ unit: p.support, share: 1 }] : []))
              distribute(support.unit, load * support.share);
          };
          for (const p of supports) distribute(p.unit, u.weight * p.share);
          let allowed = true;
          for (const [unit, load] of loads) {
            const p = byUnit.get(unit)!;
            if (
              p.topLoad + load > p.maxTopLoad + EPS ||
              u.density > p.density + EPS ||
              load > p.weight + EPS
            ) {
              allowed = false;
              break;
            }
          }
          if (!allowed) continue;
          // Compare a low centre-of-mass layout with compact front-to-rear layouts.
          // Spreading every dense small box across the floor can block tall cargo;
          // compact layouts reuse valid supports before consuming more floor.
          if (
            !best ||
            (strategy === "density-low"
              ? s.z < best.z - EPS ||
                (Math.abs(s.z - best.z) <= EPS &&
                  (bi < best.bi ||
                    (bi === best.bi && rect.x < best.rect.x - EPS)))
              : compactCost(bi, rect.x + rect.length, s.z) <
                compactCost(best.bi, best.rect.x + best.rect.length, best.z) -
                  EPS)
          ) {
            best = { bi, si, z: s.z, rect, loads, supports };
          }
          // First valid tight fit on this plane; other planes still compete by height.
          break;
        }
      }
    }
    // A failed place rejects the whole candidate selection; no partial shipment escapes.
    if (!best) return null;
    const bin = bins[best.bi],
      surface = bin.surfaces[best.si];
    const rect = best.rect;
    surface.free = subtract(surface.free, rect);
    for (const [unit, load] of best.loads) byUnit.get(unit)!.topLoad += load;
    const placed: Placement = {
      ...rect,
      z: surface.z,
      height: u.height,
      weight: u.weight,
      density: u.density,
      cargoId: u.cargoId,
      unit: u.unit,
      pallet: u.pallet,
      palletStacking: !!u.palletStacking,
      estimated: u.estimated,
      compartment: best.bi,
      support: best.supports[0]?.unit ?? null,
      supports: best.supports,
      topLoad: 0,
      maxTopLoad: u.stackable ? u.maxTopLoad : 0,
    };
    bin.placements.push(placed);
    byUnit.set(placed.unit, placed);
    if (placed.maxTopLoad > 0) {
      const top = placed.z + placed.height;
      const existing = bin.surfaces.find((s) => Math.abs(s.z - top) <= EPS);
      if (existing) {
        existing.parents.push(placed.unit);
        existing.free = mergeFloorRects([...existing.free, rect]);
      } else
        bin.surfaces.push({ parents: [placed.unit], z: top, free: [rect] });
    }
  }
  // x = 0 is the front wall. Keep the packing origin instead of moving cargo
  // toward the center: a mass-center estimate is not an axle-load calculation.
  return bins.flatMap((b) => b.placements);
}
