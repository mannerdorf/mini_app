import {expect,it} from 'vitest';
import {calendarDays,localDateKey,planProgress,groupPlannedCargo,groupPlansByVehicle,type SendingPlan} from './planningModel';
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

it('groups plans by both transport mode and preset while preserving dated contents',()=>{
 const plans=[{...plan,id:'auto-b',date:'2026-10-10'},{...plan,id:'auto-a'},{...plan,id:'roro',mode:'roro' as const},{...plan,id:'rigid',vehicleId:'rigid'},{...plan,id:'container',mode:'ferry' as const,vehicleId:'40hc'},{...plan,id:'air',mode:'air' as const,vehicleId:''},{...plan,id:'unknown',mode:'' as const,vehicleId:''}];
 const groups=groupPlansByVehicle(plans);
 expect(groups).toHaveLength(6);
 expect(groups.find(group=>group.key==='auto:tent')?.plans.map(item=>item.id)).toEqual(['auto-a','auto-b']);
 expect(groups.find(group=>group.key==='roro:tent')?.label).toMatch(/^RoRo · Тент/);
 expect(groups.find(group=>group.key==='ferry:40hc')?.label).toMatch(/^Контейнер · 40/);
 expect(groups.find(group=>group.key==='air:')?.label).toBe('Авиа');
 expect(groups.find(group=>group.key===':')?.label).toBe('Тип не указан');
 expect(groups.flatMap(group=>group.plans)).toHaveLength(plans.length);
});
