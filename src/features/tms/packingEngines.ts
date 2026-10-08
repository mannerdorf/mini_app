/**
 * Browser adaptations, not the Java/Python packages themselves.
 * LAFF: https://github.com/skjolber/3d-bin-container-packing (Apache-2.0).
 * EP/sequence search: https://github.com/HamzaMrA/LoadZa (MIT).
 * See docs/tms-packing-engines.md for pinned sources and deliberate differences.
 */
import type { Compartment, PackageGroup, Placement } from "./model";

export type PackingUnit = PackageGroup & {
  cargoId: string;
  unit: string;
  estimated: boolean;
  density: number;
};
export type ExternalStrategy =
  "laff" | "laff-dense" | "loadza-layer" | "loadza-dbl" | "loadza-contact";
type Point = { x: number; y: number; z: number };
type Space = Point & { length: number; width: number; height: number };
type Candidate = Placement & { delta: Map<string, number> };
const EPS = 1e-6;
const intersect = (a: number, al: number, b: number, bl: number) =>
  Math.max(0, Math.min(a + al, b + bl) - Math.max(a, b));
const overlaps = (a: Space, b: Space) =>
  intersect(a.x, a.length, b.x, b.length) > EPS &&
  intersect(a.y, a.width, b.y, b.width) > EPS &&
  intersect(a.z, a.height, b.z, b.height) > EPS;
const contains = (a: Space, b: Space) =>
  b.x >= a.x - EPS &&
  b.y >= a.y - EPS &&
  b.z >= a.z - EPS &&
  b.x + b.length <= a.x + a.length + EPS &&
  b.y + b.width <= a.y + a.width + EPS &&
  b.z + b.height <= a.z + a.height + EPS;
const volume = (u: Space | PackingUnit) => u.length * u.width * u.height;
const shapeKey = (u: PackingUnit) =>
  [
    u.length,
    u.width,
    u.height,
    u.weight,
    u.floorOnly,
    u.pallet,
    u.palletStacking,
    u.stackable,
    u.maxTopLoad,
    u.rotate,
  ].join("/");
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i];
  return 0;
};
// XY spatial index: gravity/support need all heights in the candidate's footprint.
// Inclusive cell edges also retain touching neighbors for contact scoring.
type Grid = Map<string, Placement[]>;
const CELL = 0.5;
function gridCells(p: { x: number; y: number }, l: number, w: number) {
  const keys: string[] = [];
  for (let x = Math.floor(p.x / CELL); x <= Math.floor((p.x + l) / CELL); x++)
    for (let y = Math.floor(p.y / CELL); y <= Math.floor((p.y + w) / CELL); y++)
      keys.push(`${x}/${y}`);
  return keys;
}
function neighbors(grid: Grid, p: Point, l: number, w: number) {
  return [...new Set(gridCells(p, l, w).flatMap((key) => grid.get(key) ?? []))];
}
function indexPlace(grid: Grid, p: Placement) {
  for (const key of gridCells(p, p.length, p.width)) {
    const cell = grid.get(key);
    if (cell) cell.push(p);
    else grid.set(key, [p]);
  }
}
function orientations(u: PackingUnit): [number, number][] {
  return u.rotate && Math.abs(u.length - u.width) > EPS
    ? [
        [u.length, u.width],
        [u.width, u.length],
      ]
    : [[u.length, u.width]];
}

// LoadZa's _load_delta: propagate the full new weight through the support DAG,
// split by contact area. Never check only the immediately adjacent lower box.
function loadDelta(
  supports: NonNullable<Placement["supports"]>,
  weight: number,
  byUnit: Map<string, Placement>,
) {
  const delta = new Map<string, number>();
  const pending = new Map(supports.map((s) => [s.unit, weight * s.share]));
  while (pending.size) {
    // A lower node can have multiple incoming paths. Process highest z first,
    // aggregating their contributions before visiting each lower node once.
    let unit = "",
      highest = -Infinity;
    for (const key of pending.keys()) {
      const z = byUnit.get(key)!.z;
      if (z > highest) {
        unit = key;
        highest = z;
      }
    }
    const load = pending.get(unit)!;
    pending.delete(unit);
    delta.set(unit, load);
    for (const below of byUnit.get(unit)!.supports ?? [])
      pending.set(
        below.unit,
        (pending.get(below.unit) ?? 0) + load * below.share,
      );
  }
  return delta;
}
function candidate(
  u: PackingUnit,
  point: Point,
  length: number,
  width: number,
  bin: number,
  bounds: Compartment,
  placed: Placement[],
  byUnit: Map<string, Placement>,
  settle: boolean,
): Candidate | null {
  const p: Placement = {
    ...point,
    length,
    width,
    height: u.height,
    weight: u.weight,
    density: u.density,
    cargoId: u.cargoId,
    unit: u.unit,
    estimated: u.estimated,
    pallet: u.pallet,
    palletStacking: !!u.palletStacking,
    compartment: bin,
    maxTopLoad: u.stackable ? u.maxTopLoad : 0,
    topLoad: 0,
    support: null,
    supports: [],
  };
  if (
    p.x < -EPS ||
    p.y < -EPS ||
    p.z < -EPS ||
    p.x + length > bounds.length + EPS ||
    p.y + width > bounds.width + EPS ||
    p.z + u.height > bounds.height + EPS
  )
    return null;
  // LoadZa's gravity settle: lower to the highest footprint-overlapping face
  // below the offered corner, then test collisions/support at the new position.
  if (settle) {
    let z = 0;
    for (const q of placed)
      if (
        q.z + q.height <= p.z + EPS &&
        intersect(p.x, length, q.x, q.length) > EPS &&
        intersect(p.y, width, q.y, q.width) > EPS
      )
        z = Math.max(z, q.z + q.height);
    p.z = z;
  }
  if ((u.floorOnly && p.z > EPS) || placed.some((q) => overlaps(p, q)))
    return null;
  if (p.z > EPS) {
    const area = length * width;
    p.supports = placed.flatMap((q) => {
      if (Math.abs(q.z + q.height - p.z) > EPS) return [];
      const contact =
        intersect(p.x, length, q.x, q.length) *
        intersect(p.y, width, q.y, q.width);
      return contact > EPS ? [{ unit: q.unit, share: contact / area }] : [];
    });
    // Keep HAULZ's full support requirement in BOTH engines. Do not inherit
    // LoadZa's default 70%, or inflate utilization by turning support off.
    if (Math.abs(p.supports.reduce((s, q) => s + q.share, 0) - 1) > EPS)
      return null;
    if (
      u.pallet &&
      p.supports.some((s) => {
        const q = byUnit.get(s.unit)!;
        return !u.palletStacking || !q.pallet || !q.palletStacking;
      })
    )
      return null;
    p.support = p.supports[0]?.unit ?? null;
  }
  for (const support of p.supports!) {
    const base = byUnit.get(support.unit)!;
    if (
      u.density > base.density + EPS ||
      base.topLoad + u.weight * support.share > base.maxTopLoad + EPS
    )
      return null;
  }
  const delta = loadDelta(p.supports!, u.weight, byUnit);
  for (const [unit, extra] of delta) {
    const base = byUnit.get(unit)!;
    if (
      base.topLoad + extra > base.maxTopLoad + EPS ||
      u.density > base.density + EPS
    )
      return null;
  }
  return { ...p, delta };
}
function commit(
  c: Candidate,
  placed: Placement[],
  byUnit: Map<string, Placement>,
) {
  const { delta, ...p } = c;
  for (const [unit, weight] of delta) byUnit.get(unit)!.topLoad += weight;
  placed.push(p);
  byUnit.set(p.unit, p);
}
function splitSpaces(spaces: Space[], p: Placement): Space[] {
  const out: Space[] = [];
  for (const s of spaces) {
    if (!overlaps(s, p)) {
      out.push(s);
      continue;
    }
    if (p.x > s.x + EPS) out.push({ ...s, length: p.x - s.x });
    if (p.x + p.length < s.x + s.length - EPS)
      out.push({
        ...s,
        x: p.x + p.length,
        length: s.x + s.length - p.x - p.length,
      });
    if (p.y > s.y + EPS) out.push({ ...s, width: p.y - s.y });
    if (p.y + p.width < s.y + s.width - EPS)
      out.push({
        ...s,
        y: p.y + p.width,
        width: s.y + s.width - p.y - p.width,
      });
    if (p.z > s.z + EPS) out.push({ ...s, height: p.z - s.z });
    if (p.z + p.height < s.z + s.height - EPS)
      out.push({
        ...s,
        z: p.z + p.height,
        height: s.z + s.height - p.z - p.height,
      });
  }
  return out.filter(
    (s, i) =>
      !out.some(
        (q, j) => i !== j && contains(q, s) && (!contains(s, q) || j < i),
      ),
  );
}

/** LAFF: largest footprint establishes a level, fill its 3D residual spaces,
 * then advance to the next level. Our support rules may reject geometric fits. */
function laff(
  units: PackingUnit[],
  bounds: Compartment[],
  dense: boolean,
): Placement[] | null {
  const bins = bounds.map((b) => ({
    placed: [] as Placement[],
    free: [{ ...b, x: 0, y: 0, z: 0 }] as Space[],
    grid: new Map() as Grid,
    level: 0,
    ceiling: 0,
  }));
  const byUnit = new Map<string, Placement>();
  const left = [...units];
  const rank = (a: PackingUnit, b: PackingUnit) =>
    Number(b.floorOnly) - Number(a.floorOnly) ||
    (dense ? b.density - a.density : 0) ||
    b.length * b.width - a.length * a.width ||
    b.density - a.density ||
    volume(b) - volume(a) ||
    a.unit.localeCompare(b.unit);
  left.sort(rank);
  for (let bi = 0; bi < bins.length && left.length; bi++) {
    const b = bins[bi];
    while (left.length) {
      let found: { c: Candidate; u: PackingUnit } | null = null;
      const starting = b.ceiling <= b.level + EPS;
      // At a new level the largest valid footprint leads. Within the level,
      // exact-height fits first, then volume, as in upstream LAFF.
      const ordered = starting
        ? left
        : [...left].sort(
            (a, c) =>
              Number(c.floorOnly) - Number(a.floorOnly) ||
              (dense ? c.density - a.density : 0) ||
              Number(Math.abs(c.height - (b.ceiling - b.level)) < EPS) -
                Number(Math.abs(a.height - (b.ceiling - b.level)) < EPS) ||
              volume(c) - volume(a) ||
              rank(a, c),
          );
      const tested = new Set<string>();
      for (const u of ordered) {
        const key = shapeKey(u);
        if (tested.has(key)) continue;
        tested.add(key);
        let best: Candidate | null = null;
        let bestScore: number[] = [];
        for (const s of b.free) {
          if (
            !starting &&
            s.z + u.height > b.ceiling + EPS &&
            !(dense && Math.abs(s.z - b.level) < EPS)
          )
            continue;
          for (const [l, w] of orientations(u)) {
            if (
              l > s.length + EPS ||
              w > s.width + EPS ||
              u.height > s.height + EPS
            )
              continue;
            const c = candidate(
              u,
              s,
              l,
              w,
              bi,
              bounds[bi],
              neighbors(b.grid, s, l, w),
              byUnit,
              false,
            );
            if (!c) continue;
            const score = [c.x, c.z, c.y, s.length * s.width - l * w];
            if (!best || compare(score, bestScore) < 0) {
              best = c;
              bestScore = score;
            }
          }
        }
        if (best) {
          found = { c: best, u };
          break;
        }
      }
      if (!found) {
        if (starting || b.ceiling >= bounds[bi].height - EPS) break;
        b.level = b.ceiling;
        continue;
      }
      if (starting || dense)
        b.ceiling = Math.max(b.ceiling, found.c.z + found.c.height);
      commit(found.c, b.placed, byUnit);
      indexPlace(b.grid, b.placed[b.placed.length - 1]);
      b.free = splitSpaces(b.free, found.c);
      left.splice(left.indexOf(found.u), 1);
    }
  }
  return left.length ? null : bins.flatMap((b) => b.placed);
}

function contactArea(p: Placement, placed: Placement[], b: Compartment) {
  let area =
    (p.x < EPS || Math.abs(p.x + p.length - b.length) < EPS
      ? p.width * p.height
      : 0) +
    (p.y < EPS || Math.abs(p.y + p.width - b.width) < EPS
      ? p.length * p.height
      : 0) +
    (p.z < EPS ? p.length * p.width : 0);
  for (const q of placed) {
    if (
      Math.abs(p.x + p.length - q.x) < EPS ||
      Math.abs(q.x + q.length - p.x) < EPS
    )
      area +=
        intersect(p.y, p.width, q.y, q.width) *
        intersect(p.z, p.height, q.z, q.height);
    if (
      Math.abs(p.y + p.width - q.y) < EPS ||
      Math.abs(q.y + q.width - p.y) < EPS
    )
      area +=
        intersect(p.x, p.length, q.x, q.length) *
        intersect(p.z, p.height, q.z, q.height);
    if (
      Math.abs(p.z + p.height - q.z) < EPS ||
      Math.abs(q.z + q.height - p.z) < EPS
    )
      area +=
        intersect(p.x, p.length, q.x, q.length) *
        intersect(p.y, p.width, q.y, q.width);
  }
  return area;
}
/** LoadZa EP kernel: corner pool, settle, local constraints, recursive stacking.
 * No CG translation: HAULZ keeps the front wall origin until actual axle data exists. */
function extremePoints(
  units: PackingUnit[],
  bounds: Compartment[],
  scorer: "layer" | "dbl" | "contact",
) {
  const bins = bounds.map(() => ({
    placed: [] as Placement[],
    points: [{ x: 0, y: 0, z: 0 }] as Point[],
    seen: new Set(["0/0/0"]),
    grid: new Map() as Grid,
  }));
  const byUnit = new Map<string, Placement>();
  const missed: PackingUnit[] = [];
  const failed = new Map<string, number>();
  let revision = 0;
  for (const u of units) {
    const signature = shapeKey(u);
    if (failed.get(signature) === revision) {
      missed.push(u);
      continue;
    }
    let found: Candidate | null = null;
    for (let bi = 0; bi < bins.length && !found; bi++) {
      const b = bins[bi];
      const points = [...b.points]
        .sort((a, c) =>
          scorer === "layer"
            ? a.z - c.z || a.x - c.x || a.y - c.y
            : a.x - c.x || a.y - c.y || a.z - c.z,
        )
        .slice(0, 400);
      let score: number[] = [];
      for (const point of points) {
        for (const [l, w] of orientations(u)) {
          const c = candidate(
            u,
            point,
            l,
            w,
            bi,
            bounds[bi],
            neighbors(b.grid, point, l, w),
            byUnit,
            true,
          );
          if (!c) continue;
          const value =
            scorer === "contact"
              ? [
                  -contactArea(c, neighbors(b.grid, c, l, w), bounds[bi]),
                  c.x,
                  c.y,
                  c.z,
                ]
              : [];
          if (!found || compare(value, score) < 0) {
            found = c;
            score = value;
          }
          if (scorer !== "contact") break;
        }
        if (found && scorer !== "contact") break;
      }
    }
    if (!found) {
      failed.set(signature, revision);
      missed.push(u);
      continue;
    }
    revision++;
    const b = bins[found.compartment];
    commit(found, b.placed, byUnit);
    indexPlace(b.grid, b.placed[b.placed.length - 1]);
    for (const point of [
      { x: found.x + found.length, y: found.y, z: found.z },
      { x: found.x, y: found.y + found.width, z: found.z },
      { x: found.x, y: found.y, z: found.z + found.height },
    ]) {
      const key = `${point.x}/${point.y}/${point.z}`;
      if (!b.seen.has(key)) {
        b.seen.add(key);
        b.points.push(point);
      }
    }
    if (b.placed.length % 16 === 0)
      b.points = b.points.filter(
        (p) =>
          !neighbors(b.grid, p, EPS, EPS).some(
            (q) =>
              p.x >= q.x - EPS &&
              p.x < q.x + q.length - EPS &&
              p.y >= q.y - EPS &&
              p.y < q.y + q.width - EPS &&
              p.z >= q.z - EPS &&
              p.z < q.z + q.height - EPS,
          ),
      );
  }
  return { placements: bins.flatMap((b) => b.placed), missed };
}

export function packWithEngine(
  units: PackingUnit[],
  bounds: Compartment[],
  strategy: ExternalStrategy,
): Placement[] | null {
  if (strategy === "laff" || strategy === "laff-dense")
    return laff(units, bounds, strategy === "laff-dense");
  const scorer = strategy.slice(7) as "layer" | "dbl" | "contact";
  const ordered = [...units].sort(
    (a, b) =>
      Number(b.floorOnly) - Number(a.floorOnly) ||
      b.density - a.density ||
      volume(b) - volume(a) ||
      a.unit.localeCompare(b.unit),
  );
  let result = extremePoints(ordered, bounds, scorer);
  if (!result.missed.length) return result.placements;
  // LoadZa improve_sa's promote/shift neighborhood. Deterministic bounded search
  // adapts its permutation improvement to shipment-atomic feasibility requests.
  // Preserve floor-only leading tier; placement feasibility still checks density.
  const floorCount = ordered.filter((u) => u.floorOnly).length;
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = [...ordered];
    const target = result.missed[attempt % result.missed.length];
    const i = order.indexOf(target);
    order.splice(i, 1);
    order.splice(target.floorOnly ? 0 : floorCount, 0, target);
    const trial = extremePoints(order, bounds, scorer);
    if (!trial.missed.length) return trial.placements;
    if (
      trial.missed.reduce((s, u) => s + volume(u), 0) <
      result.missed.reduce((s, u) => s + volume(u), 0)
    )
      result = trial;
  }
  return null;
}

/** Independent final audit. Rebuild contact and load transfer from geometry,
 * without trusting candidate checks, stored supports or reported top loads. */
export function auditPacking(
  placements: Placement[],
  units: PackingUnit[],
  bounds: Compartment[],
): string | null {
  const byUnit = new Map(units.map((u) => [u.unit, u]));
  if (
    placements.length !== units.length ||
    new Set(placements.map((p) => p.unit)).size !== units.length
  )
    return "Потеряны или повторены грузовые места";
  const ordered = [...placements].sort((a, b) => a.z - b.z);
  const support = new Map<string, { unit: string; share: number }[]>();
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i],
      u = byUnit.get(p.unit),
      b = bounds[p.compartment];
    if (!u || !b || !contains({ ...b, x: 0, y: 0, z: 0 }, p))
      return "Груз выходит за габариты";
    if (
      ![p.x, p.y, p.z, p.length, p.width, p.height, p.weight, p.density].every(
        Number.isFinite,
      ) ||
      Math.abs(p.height - u.height) > EPS ||
      Math.abs(p.weight - u.weight) > EPS ||
      Math.abs(p.density - u.density) > EPS ||
      !orientations(u).some(
        ([l, w]) => Math.abs(p.length - l) < EPS && Math.abs(p.width - w) < EPS,
      )
    )
      return "Изменены размеры или масса места";
    if (u.floorOnly && p.z > EPS) return "Груз должен стоять на полу";
    if (
      ordered.some(
        (q, j) => i !== j && q.compartment === p.compartment && overlaps(p, q),
      )
    )
      return "Пересечение грузовых мест";
    const contacts =
      p.z < EPS
        ? []
        : ordered.flatMap((q) => {
            if (
              q.compartment !== p.compartment ||
              Math.abs(q.z + q.height - p.z) > EPS
            )
              return [];
            const area =
              intersect(p.x, p.length, q.x, q.length) *
              intersect(p.y, p.width, q.y, q.width);
            return area > EPS
              ? [{ unit: q.unit, share: area / (p.length * p.width) }]
              : [];
          });
    if (
      p.z > EPS &&
      Math.abs(contacts.reduce((s, c) => s + c.share, 0) - 1) > EPS
    )
      return "Недостаточная опора";
    if (
      u.pallet &&
      contacts.some((c) => {
        const base = byUnit.get(c.unit)!;
        return !u.palletStacking || !base.pallet || !base.palletStacking;
      })
    )
      return "Нет разрешения на палету поверх палеты";
    support.set(p.unit, contacts);
  }
  const loads = new Map<string, number>();
  // Reconstruct total carried weight top-down from independently derived faces.
  for (const p of [...ordered].reverse()) {
    const carried = p.weight + (loads.get(p.unit) ?? 0);
    for (const contact of support.get(p.unit) ?? []) {
      const base = byUnit.get(contact.unit)!;
      if (p.density > base.density + EPS)
        return "Более плотный груз над менее плотным";
      loads.set(
        contact.unit,
        (loads.get(contact.unit) ?? 0) + carried * contact.share,
      );
    }
  }
  for (const [unit, load] of loads) {
    const u = byUnit.get(unit)!;
    if (load > (u.stackable ? u.maxTopLoad : 0) + EPS)
      return "Превышена нагрузка сверху";
  }
  for (const p of placements)
    if (Math.abs(p.topLoad - (loads.get(p.unit) ?? 0)) > EPS)
      return "Некорректно рассчитана нагрузка сверху";
  return null;
}
