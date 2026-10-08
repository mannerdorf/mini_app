import { expect, it } from 'vitest';
import type { TmsCargo } from '../../../tms/model';
import { recommendPlanningCargo, comparePlanningRecommendations, recommendationPaidRanks, type RecommendationRequest } from './planningRecommendations';

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
it('prioritizes SLA deadlines over manual planned dates, excludes unknown SLA and respects remaining capacities', () => {
  const candidates=[
    {...cargo('1',8,2,100,'2026-10-01'),slaDeadline:'2026-10-12T00:00:00Z',plannedDeliveryDate:'2026-10-01'},
    {...cargo('2',2,8,20,'2026-10-07'),slaDeadline:'2026-10-09T00:00:00Z',plannedDeliveryDate:'2026-10-20'},
    {...cargo('3',1,1,500,'2026-10-01'),slaDeadline:'',plannedDeliveryDate:'2026-10-01'},
    {...cargo('4',1,1,500),slaDeadline:'2026-02-30'},
    {...cargo('5',1,1,500,''),slaDeadline:'2026-10-08T00:00:00Z'},
    {...cargo('6',1,1,500),slaDeadline:'2026-10-07T00:00:00Z'},
  ];
  const result=recommendPlanningCargo(request(candidates,{mode:'delivery',locked:['6']}));
  expect(result).toMatchObject({numbers:['5','2'],weight:3,volume:9,excluded:2});
  expect(recommendPlanningCargo(request(candidates,{mode:'delivery',selected:[cargo('outside',8,2)],locked:['5','6']})))
    .toMatchObject({numbers:['2'],weight:2,volume:8});
});

it('explains when delivery recommendations are blocked by missing deadlines, rather than by capacity',()=>{
 const result=recommendPlanningCargo(request([cargo('1',1,1),cargo('2',2,2)],{mode:'delivery'}));
 expect(result).toMatchObject({numbers:[],missingDelivery:2,missingMetrics:0,excluded:2});expect(result.message).toContain('нет корректной даты поступления');
 const partial=recommendPlanningCargo(request([{...cargo('1',1,1),slaDeadline:'2026-10-09T00:00:00Z',plannedDeliveryDate:'2026-10-20'},cargo('2',2,2)],{mode:'delivery'}));
 expect(partial).toMatchObject({numbers:['1'],missingDelivery:1,missingMetrics:0});expect(partial.message).toBeUndefined();
});

it('protects SLA through the inclusive cutoff before maximizing PW in the remaining capacity', () => {
  const candidates = [
    { ...cargo('urgent', 4, 4, 5), slaDeadline: '2026-10-09T23:59:59Z' },
    { ...cargo('heavy', 5, 1, 40), slaDeadline: '2026-10-15T00:00:00Z' },
    { ...cargo('bulky', 1, 5, 40), slaDeadline: '2026-10-16T00:00:00Z' },
    { ...cargo('large', 10, 10, 200), slaDeadline: '2026-10-10T00:00:00Z' },
  ];
  const result = recommendPlanningCargo(request(candidates, { mode: 'sla-paid', slaCutoff: '2026-10-09' }));
  expect(result).toMatchObject({ numbers: ['urgent', 'bulky', 'heavy'], weight: 10, volume: 10, paidWeight: 85, optimal: true });
  expect(result.reasons.urgent.text).toContain('Приоритет по SLA');
  expect(result.reasons.bulky.text).toContain('Дозагрузка после');
  expect(result.reasons.large.text).toContain('Не помещается');
  const purePaid = recommendPlanningCargo(request(candidates));
  expect(purePaid).toMatchObject({ numbers: ['large'], paidWeight: 200 });
  const laterCutoff = recommendPlanningCargo(request(candidates, { mode: 'sla-paid', slaCutoff: '2026-10-16' }));
  expect(laterCutoff).toMatchObject({ numbers: ['urgent', 'heavy', 'bulky'], paidWeight: 85 });
});

it('combined SLA respects existing selections, skips unknown SLA and permits urgent cargo with unknown PW', () => {
  const selected = cargo('selected', 5, 1, 10);
  const result = recommendPlanningCargo(request([
    selected,
    { ...cargo('shipped', 1, 1, 500), slaDeadline: '2026-10-07' },
    { ...cargo('urgent', 1, 1, null), slaDeadline: '2026-10-08' },
    { ...cargo('fill', 4, 8, 100), slaDeadline: '2026-10-20' },
    cargo('unknown-sla', 1, 1, 1000),
    { ...cargo('unknown-pw', 1, 1, null), slaDeadline: '2026-10-20' },
  ], { mode: 'sla-paid', slaCutoff: '2026-10-09', selected: [selected, selected], locked: ['shipped'] }));
  expect(result).toMatchObject({ numbers: ['urgent', 'fill'], weight: 5, volume: 9, paidWeight: 100, missingPaid: 1, excluded: 2 });
  expect(result.reasons.selected.kind).toBe('selected');
  expect(result.reasons.shipped.kind).toBe('locked');
  expect(result.reasons['unknown-sla'].text).toContain('срок по SLA');
  expect(result.reasons['unknown-pw'].text).toContain('платный вес');
  expect(recommendPlanningCargo(request([], { mode: 'sla-paid', slaCutoff: '2026-02-30' })).message).toContain('SLA до');
});

it('explains both capacity deficits and missing data for each candidate without changing any selection', () => {
  const candidates = [cargo('1', 8, 9, 100), cargo('2', 4, 3, 1), cargo('3', null, 1, null)];
  const result = recommendPlanningCargo(request(candidates));
  expect(result.reasons['1']).toMatchObject({ kind: 'recommended' });
  expect(result.reasons['2'].text).toContain('2 кг грузоподъёмности и 2 м³ объёма');
  expect(result.reasons['3'].text).toBe('Не хватает данных: вес, платный вес.');
  expect(candidates[0]).toMatchObject({ weight: 8, volume: 9, paidWeight: 100 });
});

it('compares the same free capacity, ranks all tied extrema and does not rank unknown PW as zero', () => {
  const candidates = [
    { ...cargo('1', 10, 10, 10, '2026-10-01'), slaDeadline: '2026-10-09' },
    { ...cargo('2', 10, 10, 200, '2026-10-02'), slaDeadline: '2026-10-20' },
  ];
  const results = comparePlanningRecommendations(request(candidates, { slaCutoff: '2026-10-09' }));
  expect(recommendationPaidRanks(results)).toEqual({ fifo: 'min', paid: 'max', delivery: 'min', 'sla-paid': 'min' });
  expect(results['sla-paid'].numbers).toEqual(['1']);
  const equal = comparePlanningRecommendations(request([candidates[0]], { slaCutoff: '2026-10-09' }));
  expect(recommendationPaidRanks(equal)).toEqual({});
  const unknown = comparePlanningRecommendations(request([{ ...candidates[0], paidWeight: null }, candidates[1]], { slaCutoff: '2026-10-09' }));
  expect(recommendationPaidRanks(unknown)).toEqual({});
  expect(unknown['sla-paid'].missingPaid).toBe(1);
});
