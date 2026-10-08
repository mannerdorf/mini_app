import { expect, it } from 'vitest';
import type { TmsCargo } from '../../../tms/model';
import { recommendPlanningCargo, type RecommendationRequest } from './planningRecommendations';

const cargo = (number: string, weight: number | null, volume: number | null, paidWeight: number | null = weight, received = '2026-10-06'): TmsCargo => ({
  id: number, number, weight, volume, paidWeight, received, customer: 'Клиент', customerId: '1', receiver: 'Склад', route: 'MSK → KGD', places: 1, readiness: 'ready', reason: '', updatedAt: null,
});
const request = (candidates: TmsCargo[], options: Partial<RecommendationRequest> = {}): RecommendationRequest => ({
  mode: 'paid', candidates, selected: [], locked: [], vehicle: { payload: 10, volume: 10 }, ...options,
});
it('FIFO follows receipt date then shipment number and respects both remaining capacities', () => {
  const result = recommendPlanningCargo(request([
    cargo('12', 4, 6, 20, '2026-10-07'), cargo('11', 5, 5, 500, '2026-10-06'), cargo('10', 4, 4, 4, '2026-10-06'), cargo('9', 100, 1, 100, '2026-10-05'), cargo('13', 1, 1, 1, ''),
  ], { mode: 'fifo', selected: [cargo('20', 2, 2)], locked: ['11'] }));
  expect(result).toMatchObject({ numbers: ['10'], weight: 4, volume: 4, excluded: 1 });
});
it('combines heavy and bulky cargo to maximize PW instead of taking the largest single PW', () => {
  const result = recommendPlanningCargo(request([cargo('1', 6, 6, 900), cargo('2', 8, 2, 700), cargo('3', 2, 8, 700)]));
  expect(result).toMatchObject({ numbers: ['2', '3'], weight: 10, volume: 10, paidWeight: 1400, optimal: true });
});
it('uses selected cargo even outside the visible period and never recommends selected or shipped members', () => {
  const chosen = cargo('1', 8, 2, 8, '2026-09-01');
  const result = recommendPlanningCargo(request([chosen, cargo('2', 2, 8, 20), cargo('3', 1, 1, 1000), cargo('4', 3, 1, 100)], { selected: [chosen, chosen], locked: ['3'] }));
  expect(result).toMatchObject({ numbers: ['2'], paidWeight: 20, optimal: true });
});
it('excludes missing metrics without substituting weight for PW and reports unavailable capacity', () => {
  expect(recommendPlanningCargo(request([cargo('1', null, 1, 100), cargo('2', 1, null, 100), cargo('3', 1, 1, null), cargo('4', 1, 1, 5)])))
    .toMatchObject({ numbers: ['4'], excluded: 3, paidWeight: 5 });
  expect(recommendPlanningCargo(request([], { vehicle: undefined })).message).toContain('выберите тип ТС');
  expect(recommendPlanningCargo(request([], { selected: [cargo('1', null, 1)] })).message).toContain('не заполнены');
  expect(recommendPlanningCargo(request([], { selected: [cargo('1', 11, 1)] })).message).toContain('переполнено');
  expect(recommendPlanningCargo(request([cargo('1', 0, 0, 5), cargo('2', 10, 10, 10)]))).toMatchObject({ numbers: ['1', '2'], paidWeight: 15, optimal: true });
});
it('matches exhaustive optimum on varied small instances, including zero resource costs', () => {
  let seed = 14;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 40; trial++) {
    const candidates = Array.from({ length: 9 }, (_, i) => cargo(String(i + 1), random() % 9, random() % 9, 1 + random() % 30));
    let best = 0;
    for (let mask = 0; mask < 1 << candidates.length; mask++) {
      let weight = 0, volume = 0, paid = 0;
      candidates.forEach((item, i) => { if (mask & 1 << i) { weight += item.weight!; volume += item.volume!; paid += item.paidWeight!; } });
      if (weight <= 10 && volume <= 10) best = Math.max(best, paid);
    }
    const result = recommendPlanningCargo(request(candidates));
    expect(result.paidWeight).toBe(best); expect(result.optimal).toBe(true); expect(result.weight).toBeLessThanOrEqual(10); expect(result.volume).toBeLessThanOrEqual(10);
  }
});
it('returns a feasible best-known set and does not claim an optimum when its search budget is exhausted', () => {
  const result = recommendPlanningCargo(request([cargo('1', 6, 6, 900), cargo('2', 8, 2, 700), cargo('3', 2, 8, 700)]), 0);
  expect(result.optimal).toBe(false); expect(result.weight).toBeLessThanOrEqual(10); expect(result.volume).toBeLessThanOrEqual(10);
});
