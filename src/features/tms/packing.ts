export type FloorRect = { x: number; y: number; length: number; width: number };
const EPS = 1e-7;
const inside = (a: FloorRect, b: FloorRect) =>
  a.x >= b.x - EPS &&
  a.y >= b.y - EPS &&
  a.x + a.length <= b.x + b.length + EPS &&
  a.y + a.width <= b.y + b.width + EPS;
/** Maximal empty rectangles. Splits may overlap each other, but never overlap placed cargo. */
function subtract(free: FloorRect[], used: FloorRect): FloorRect[] {
  const result: FloorRect[] = [];
  for (const r of free) {
    if (
      used.x >= r.x + r.length - EPS ||
      used.x + used.length <= r.x + EPS ||
      used.y >= r.y + r.width - EPS ||
      used.y + used.width <= r.y + EPS
    ) {
      result.push(r);
      continue;
    }
    if (used.x > r.x + EPS) result.push({ ...r, length: used.x - r.x });
    if (used.x + used.length < r.x + r.length - EPS)
      result.push({
        ...r,
        x: used.x + used.length,
        length: r.x + r.length - used.x - used.length,
      });
    if (used.y > r.y + EPS) result.push({ ...r, width: used.y - r.y });
    if (used.y + used.width < r.y + r.width - EPS)
      result.push({
        ...r,
        y: used.y + used.width,
        width: r.y + r.width - used.y - used.width,
      });
  }
  return result.filter(
    (r, i) =>
      !result.some(
        (other, j) =>
          i !== j && inside(r, other) && (!inside(other, r) || j < i),
      ),
  );
}
export function packFloor(
  free: FloorRect[],
  count: number,
  length: number,
  width: number,
  allowRotation: boolean,
): { free: FloorRect[]; placements: FloorRect[] } | null {
  let remaining = free;
  const placements: FloorRect[] = [];
  for (let i = 0; i < count; i++) {
    let best: FloorRect | null = null,
      bestScore = Infinity;
    for (const r of remaining) {
      for (const [l, w] of allowRotation
        ? [
            [length, width],
            [width, length],
          ]
        : [[length, width]]) {
        if (l > r.length + EPS || w > r.width + EPS) continue;
        // Tightest remaining edge; pallet rows can mix orientations (e.g. 11 EUR pallets in 20' Dry).
        const score =
          Math.min(r.length - l, r.width - w) * 1000 +
          Math.max(r.length - l, r.width - w);
        if (score < bestScore) {
          bestScore = score;
          best = {
            x: r.x,
            y: r.y,
            length: l,
            width: w,
          };
        }
      }
    }
    if (!best) return null;
    placements.push(best);
    remaining = subtract(remaining, best);
  }
  return { free: remaining, placements };
}
