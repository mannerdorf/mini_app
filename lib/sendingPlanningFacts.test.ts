import {expect,it} from 'vitest';
import {matchingPlanningFacts,type PlanningFact} from './sendingPlanningFacts';
import {planningToday} from '../src/features/documents/sendings/planning/planningModel';
const fact=(overrides:Partial<PlanningFact>={}):PlanningFact=>({key:'one',number:'ТС1',date:'2026-10-09',vehicle:'',numbers:['10','11'],route:'MSK → KGD',updatedAt:Date.parse('2026-10-10T00:00:00+03:00'),matched:0,cargoCount:2,fresh:true,...overrides});
const plan={date:'2026-10-09',route:'MSK → KGD',numbers:['10','12']};
it('uses the Moscow day boundary even when the host timezone differs',()=>{
 expect(planningToday(new Date('2026-10-09T20:59:59Z'))).toBe('2026-10-09');
 expect(planningToday(new Date('2026-10-09T21:00:00Z'))).toBe('2026-10-10');
 expect(matchingPlanningFacts(plan,[fact()],new Date('2026-10-09T20:59:59Z'))).toEqual([]);
 expect(matchingPlanningFacts(plan,[fact()],new Date('2026-10-09T21:00:00Z'))[0]).toMatchObject({matched:1,fresh:true});
});
it('rejects mismatched routes and dates and marks pre-midnight cache composition as unconfirmed',()=>{
 const now=new Date('2026-10-10T00:01:00+03:00');
 const matches=matchingPlanningFacts(plan,[fact({key:'wrong-route',route:'KGD → MSK'}),fact({key:'old',date:'2026-10-08'}),fact({key:'future',date:'2026-10-11'}),fact({key:'no-route',route:'',updatedAt:Date.parse('2026-10-09T23:59:00+03:00')}),fact()],now);
 expect(matches.map(item=>item.key)).toEqual(['no-route','one']);expect(matches[0].fresh).toBe(false);expect(matches[1].fresh).toBe(true);
});
