import { expect, it } from 'vitest';
import { filterAisTrack, splitAisTrack } from './aisTrack';
const point = (lon: number, hour: number, lat = 55) => ({ lat, lon, timeUtc: `2026-10-07T${String(hour).padStart(2, '0')}:00:00Z` });
it('drops an isolated trip to Belarus and return without losing the real path', () => {
  const result = filterAisTrack([point(19, 0), point(33, 1), point(19.2, 2), point(19.3, 3)]);
  expect(result.discarded).toBe(1); expect(result.points.map(p => p.lon)).toEqual([19, 19.2, 19.3]); expect(result.breaks).toBe(0);
});
it('splits ambiguous jumps instead of inventing a connecting route', () => {
  const points = [point(19, 0), point(19.1, 1), point(33, 2), point(33.1, 3)];
  expect(splitAisTrack(points)).toEqual([[[55, 19], [55, 19.1]], [[55, 33], [55, 33.1]]]);
});
it('breaks long gaps even when distance is plausible and retains port stops', () => {
  const result = filterAisTrack([point(19, 0), point(19, 1), point(19.2, 10), point(19.3, 11)]);
  expect(result.discarded).toBe(0); expect(result.points[2].breakBefore).toBe(true); expect(splitAisTrack(result.points)).toHaveLength(2);
});
it('handles duplicate fixes, date line crossings and invalid coordinates', () => {
  expect(filterAisTrack([point(19, 0), point(19, 0)]).points).toHaveLength(1);
  expect(filterAisTrack([point(179.9, 0), point(-179.9, 1)]).breaks).toBe(0);
  expect(filterAisTrack([point(19, 0, 100)]).points).toEqual([]);
});
