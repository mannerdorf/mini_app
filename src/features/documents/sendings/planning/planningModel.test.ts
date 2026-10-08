import {expect,it} from 'vitest';
import {calendarDays,calendarWeekDays,localDateKey,planProgress,groupPlannedCargo,groupPlansByVehicle,planningVehicle,type SendingPlan} from './planningModel';
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

it('uses internal dimensions for volume and all compartments without mutating the TMS preset or payload',()=>{
 expect(planningVehicle(plan)?.volume).toBe(89.9);
 expect(planningVehicle({...plan,vehicleDimensions:{length:10,width:2,height:2}})).toMatchObject({volume:40,payload:20000,compartments:[{length:10,width:2,height:2}]});
 expect(planningVehicle({...plan,vehicleId:'train',vehicleDimensions:{length:8,width:2,height:2}})?.volume).toBe(64);
 expect(planningVehicle(plan)?.volume).toBe(89.9);
 expect(planningVehicle({...plan,mode:'air'})).toBeUndefined();
 expect(planningVehicle({...plan,vehicleDimensions:{length:0,width:2,height:2}})).toBeUndefined();
});

it('shows seven Monday-first days for a week across month and year boundaries',()=>{
 const days=calendarWeekDays(new Date(2026,9,1));expect(days).toHaveLength(7);expect(days[0].getDay()).toBe(1);expect(days[6].getDay()).toBe(0);expect(days.map(localDateKey)).toEqual(['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
 expect(calendarWeekDays(new Date(2027,0,1)).map(localDateKey)).toContain('2026-12-28');
});
