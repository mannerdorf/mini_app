import type { Placement } from "./model";

/** Mass/occupied volume within each height band, splitting boxes at band boundaries. */
export function densityBands(placements: Placement[], height: number) {
  return ["Низ", "Середина", "Верх"].map((label, i) => {
    const from = height * i / 3, to = height * (i + 1) / 3;
    let mass = 0, volume = 0;
    for (const p of placements) {
      const overlap = Math.max(0, Math.min(to, p.z + p.height) - Math.max(from, p.z));
      mass += p.weight * overlap / p.height;
      volume += p.length * p.width * overlap;
    }
    return { label, from, to, mass, volume, density: volume > 0 ? mass / volume : null };
  });
}
export function densityScale(placements: Placement[]) {
  const values = placements.map(p => p.density);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return { min, max };
}
export function densityHue(value: number, min: number, max: number) {
  const fraction = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  return (1 - fraction) * 0.58;
}
