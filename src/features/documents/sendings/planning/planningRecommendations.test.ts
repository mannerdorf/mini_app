import { expect, it } from 'vitest';
import type { TmsCargo } from '../../../tms/model';
import { recommendPlanningCargo, comparePlanningRecommendations, recommendationPaidRanks, type RecommendationRequest } from './planningRecommendations';

const cargo = (number: string, weight: number | null, volume: number | null, paidWeight: number | null = weight, received = '2026-10-06'): TmsCargo => ({
  id: number, number, weight, volume, paidWeight, received, customer: `Клиент ${number}`, customerId: number, receiver: 'Склад', route: 'MSK → KGD', places: 1, readiness: 'ready', reason: '', updatedAt: null,
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

const batch=(number:string,weight:number|null,volume:number|null,paidWeight:number|null=weight,options:Partial<TmsCargo>={}):TmsCargo=>({
 ...cargo(number,weight,volume,paidWeight,'2026-10-08'),customer:'РАДОСТЬ ДЕТЯМ ООО',customerId:'batch-customer',sender:`Отправитель ${number}`,slaDeadline:'2026-10-28T00:00:00Z',...options,
});
it('keeps the same customer receipt day together in all four modes regardless of sender',()=>{
 const group=[batch('142981',704,9.6,1000),batch('142982',197,5.45,500)];
 const other=batch('other',100,1,200,{customerId:'other-customer',customer:'Другой заказчик'});
 for(const mode of ['fifo','paid','delivery','sla-paid'] as const){
  const options={mode,vehicle:{payload:2000,volume:18},slaCutoff:'2026-10-28'};
  const together=recommendPlanningCargo(request([...group,other],options));
  expect(together.numbers).toEqual(expect.arrayContaining(['142981','142982']));expect(together.weight).toBe(1001);expect(together.volume).toBeCloseTo(16.05);
  expect(together.reasons['142981'].text).toContain('Подбирается целиком');expect(together.reasons['142982'].text).toContain('2 перев.');
  const tooLarge=recommendPlanningCargo(request([...group,other],{...options,vehicle:{payload:2000,volume:12}}));
  expect(tooLarge.numbers).toEqual(['other']);expect(tooLarge.reasons['142981'].text).toContain('целиком');expect(tooLarge.reasons['142982'].kind).toBe('skipped');
 }
});
it('separates different receipt dates, customers and routes, and normalizes a name when the customer ID is absent',()=>{
 const candidates=[batch('1',6,6,100),batch('2',6,6,90,{received:'2026-10-09'}),batch('3',4,4,60,{customerId:'different'}),batch('4',6,6,80,{route:'KGD → MSK'})];
 expect(recommendPlanningCargo(request(candidates)).numbers).toEqual(['1','3']);
 const fallback=[batch('1',6,6,100,{customerId:'',customer:' Радость  детям ООО '}),batch('2',6,6,90,{customerId:'',customer:'РАДОСТЬ ДЕТЯМ ООО'})];
 expect(recommendPlanningCargo(request(fallback)).numbers).toEqual([]);
 for(const fields of [{received:''},{customerId:'Без заказчика',customer:'Без заказчика'}]){
  const separate=recommendPlanningCargo(request([batch('1',6,6,100,fields),batch('2',6,6,90,fields)]));expect(separate.numbers).toEqual(['1']);
 }
});
it('accounts for previously selected members once and adds the remaining whole group when it fits',()=>{
 const first=batch('1',6,2,100),rest=[batch('2',1,3,20),batch('3',3,5,30)];
 const result=recommendPlanningCargo(request([first,...rest,rest[0]],{selected:[first,first]}));
 expect(result).toMatchObject({numbers:['2','3'],weight:4,volume:8,paidWeight:50,recommendedGroups:1});
 expect(result.reasons['1'].kind).toBe('selected');expect(result.reasons['2'].text).toContain('Уже выбрано: 1');
 expect(recommendPlanningCargo(request([first,...rest],{selected:[first],vehicle:{payload:9,volume:10}})).numbers).toEqual([]);
});
it('excludes the whole remaining group when any member lacks data, with a reason on each member',()=>{
 const result=recommendPlanningCargo(request([batch('1',4,4,100),batch('2',1,null,20),batch('3',1,1,20,{customerId:'other'})]));
 expect(result).toMatchObject({numbers:['3'],excluded:2,missingMetrics:1});
 expect(result.reasons['1'].text).toContain('2: объём');expect(result.reasons['2'].text).toContain('Не подбирается по частям');
 const missingPW=recommendPlanningCargo(request([batch('1',4,4,100),batch('2',1,1,null)]));expect(missingPW.numbers).toEqual([]);expect(missingPW.reasons['1'].text).toContain('платный вес');
});
it('prioritizes the earliest SLA in a group and carries the whole group before filling by PW',()=>{
 const candidates=[batch('urgent',4,4,5,{slaDeadline:'2026-10-09T23:59:59Z'}),batch('companion',2,2,null,{slaDeadline:'2026-10-28'}),
  batch('fill',4,4,60,{customerId:'fill',slaDeadline:'2026-10-28'}),batch('large',10,10,200,{customerId:'large',slaDeadline:'2026-10-28'})];
 const result=recommendPlanningCargo(request(candidates,{mode:'sla-paid',slaCutoff:'2026-10-09'}));
 expect(result).toMatchObject({numbers:['companion','urgent','fill'],weight:10,volume:10,paidWeight:65,missingPaid:1,recommendedGroups:2});
 expect(result.reasons.companion.text).toContain('Приоритет по SLA');expect(result.reasons.large.text).toContain('Не помещается');
 const pureSla=recommendPlanningCargo(request(candidates,{mode:'delivery'}));expect(pureSla.numbers).toEqual(['companion','urgent','fill']);
});
it('maximizes actual PW among whole groups, including zero-PW companions, rather than splitting the most profitable rows',()=>{
 const result=recommendPlanningCargo(request([batch('1',6,6,900),batch('2',5,5,0),batch('3',8,2,700,{customerId:'second'}),batch('4',2,8,700,{customerId:'second'})]));
 expect(result).toMatchObject({numbers:['3','4'],paidWeight:1400,weight:10,volume:10,recommendedGroups:1,optimal:true});
 const zeroCompanion=recommendPlanningCargo(request([batch('1',5,5,900),batch('2',5,5,0)]));expect(zeroCompanion).toMatchObject({numbers:['1','2'],paidWeight:900});
});
it('matches exhaustive optimal PW over group combinations while respecting both resource limits',()=>{
 let seed=77;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let trial=0;trial<30;trial++){
  const groups=Array.from({length:6},(_,group)=>Array.from({length:2},(_,member)=>batch(`${group}-${member}`,random()%5,random()%5,random()%30,{customerId:`group-${group}`})));
  let best=0;for(let mask=0;mask<1<<groups.length;mask++){
   const chosen=groups.filter((_,i)=>mask&1<<i).flat(),w=chosen.reduce((s,c)=>s+c.weight!,0),v=chosen.reduce((s,c)=>s+c.volume!,0),p=chosen.reduce((s,c)=>s+c.paidWeight!,0);
   if(w<=10&&v<=10)best=Math.max(best,p);
  }
  const result=recommendPlanningCargo(request(groups.flat()));expect(result.paidWeight).toBe(best);expect(result.optimal).toBe(true);expect(result.weight).toBeLessThanOrEqual(10);expect(result.volume).toBeLessThanOrEqual(10);
  const picked=new Set(result.numbers);for(const group of groups)expect(group.filter(c=>picked.has(c.number)).length===0||group.every(c=>picked.has(c.number))).toBe(true);
 }
});
