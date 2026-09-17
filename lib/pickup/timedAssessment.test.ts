import { it, expect, vi } from 'vitest';
import { timedAssessment } from './timedAssessment';
import type { Job } from './model';
it('uses actual departure after travel, opening and loading for following legs', async () => {
  const matrix = vi.fn().mockResolvedValue([[null,{distance:1000,duration:600}],[null,null]]);
  const result = await timedAssessment({
    jobs: [{id:'a',data:{windowFrom:'09:00',windowTo:'18:00',serviceMinutes:20}} as Job],
    matrix: Array.from({length:3}, () => [null,null,null]), departure:480, depotFrom:480, depotTo:1080, shiftTo:1080,
  }, ['a'], [{lat:1,lon:1},{lat:2,lon:2},{lat:3,lon:3}], {matrix,geocode:vi.fn(),geometry:vi.fn()}, {utc:1000,traffic:'jam',truck:{}});
  expect(matrix.mock.calls.map(c => c[1].utc)).toEqual([1000,5800]);
  expect(matrix.mock.calls.map(c => c[1].traffic)).toEqual(['jam','statistics']);
  expect(result.finish).toBe(570);
  expect(result.waiting).toBe(50);
});
