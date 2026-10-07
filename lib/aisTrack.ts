export type AisTrackPoint = { lat: number; lon: number; timeUtc: string; breakBefore?: boolean };
const MAX_SPEED_KMH = 60 * 1.852;
const MAX_GAP_MS = 6 * 60 * 60 * 1000;
function distanceKm(a: AisTrackPoint, b: AisTrackPoint) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function possible(a: AisTrackPoint, b: AisTrackPoint) {
  const elapsed = Date.parse(b.timeUtc) - Date.parse(a.timeUtc);
  return elapsed >= 0 && distanceKm(a, b) <= 1 + MAX_SPEED_KMH * elapsed / 3_600_000;
}
/** Drop isolated teleport-and-return fixes. Uncertain jumps and long gaps remain separate segments. */
export function filterAisTrack(input: AisTrackPoint[]) {
  const points = input.filter(p => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180 && Number.isFinite(Date.parse(p.timeUtc)))
    .slice().sort((a, b) => Date.parse(a.timeUtc) - Date.parse(b.timeUtc));
  const clean: AisTrackPoint[] = [];
  let discarded = 0;
  for (let i = 0; i < points.length; i++) {
    const previous = clean.at(-1), current = points[i], next = points[i + 1];
    if (previous && next && !possible(previous, current) && !possible(current, next) && possible(previous, next)) { discarded++; continue; }
    if (previous && previous.timeUtc === current.timeUtc && previous.lat === current.lat && previous.lon === current.lon) continue;
    const breakBefore = !!current.breakBefore || !!previous && (!possible(previous, current) || Date.parse(current.timeUtc) - Date.parse(previous.timeUtc) > MAX_GAP_MS);
    clean.push({ ...current, ...(breakBefore ? { breakBefore: true } : {}) });
  }
  return { points: clean, discarded, breaks: clean.filter(p => p.breakBefore).length };
}
export function splitAisTrack(input: AisTrackPoint[]): number[][][] {
  const segments: number[][][] = [];
  for (const point of filterAisTrack(input).points) {
    if (!segments.length || point.breakBefore) segments.push([]);
    segments[segments.length - 1].push([point.lat, point.lon]);
  }
  return segments.filter(segment => segment.length > 1);
}
