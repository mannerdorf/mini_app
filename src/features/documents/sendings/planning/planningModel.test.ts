import {expect,it} from 'vitest';
import {calendarDays,localDateKey,planProgress,groupPlannedCargo,type SendingPlan} from './planningModel';
const plan:SendingPlan={id:'id',revision:1,date:'2026-10-09',route:'MSK → KGD',mode:'auto',vehicleId:'tent',ferryId:null,ferryName:'',comment:'',cargo:[{id:'1:10',number:'10',customer:'Клиент',customerId:'1',receiver:'Получатель А',route:'MSK → KGD',received:'',weight:10,volume:1,places:2,readiness:'ready',reason:'',updatedAt:null},{id:'1:11',number:'11',customer:'Клиент',customerId:'1',receiver:'Получатель Б',route:'MSK → KGD',received:'',weight:20,volume:2,places:3,readiness:'ready',reason:'',updatedAt:null}],actualCargoNumbers:['10','10','other']};
it('builds a Monday-first six-week calendar including cross-year dates and leap days',()=>{
 const days=calendarDays(new Date(2026,9,1));expect(days).toHaveLength(42);expect(days[0].getDay()).toBe(1);expect(localDateKey(days[0])).toBe('2026-09-28');expect(localDateKey(days[41])).toBe('2026-11-08');
 expect(calendarDays(new Date(2024,1,1)).map(localDateKey)).toContain('2024-02-29');
 expect(localDateKey(calendarDays(new Date(2027,0,1))[0])).toBe('2026-12-28');
});
it('counts actual sending membership once and handles empty recommendations',()=>{
 expect(planProgress(plan)).toEqual({planned:2,actual:1,percent:50});expect(planProgress({...plan,cargo:[]})).toEqual({planned:0,actual:0,percent:0});
});
it('groups customer, cargo and receiver views without duplicating weight or fact totals',()=>{
 expect(groupPlannedCargo(plan,'cargo')).toHaveLength(2);expect(groupPlannedCargo(plan,'receiver')).toHaveLength(2);
 expect(groupPlannedCargo(plan,'customer')[0]).toMatchObject({label:'Клиент',places:5,weight:30,volume:3,actual:1});
});
