import {expect,it} from 'vitest';
import {getPlanDays,getSlaPlanDeadlineMs,getWarehouseReceiptDateForSla} from './cargoSla';

it('keeps the current SLA norms for directions and the 1C ferry flag',()=>{
 const forward={CitySender:'Москва',CityReceiver:'Калининград',DatePrih:'2026-10-01'};
 expect(getPlanDays(forward)).toBe(7);
 expect(new Date(getSlaPlanDeadlineMs(forward)).toISOString()).toBe('2026-10-08T00:00:00.000Z');
 for(const AK of [true,1,'1','true'])expect(getPlanDays({...forward,AK})).toBe(20);
 expect(getPlanDays({...forward,AK:'false'})).toBe(7);
 expect(getPlanDays({...forward,CitySender:'Балтийск',CityReceiver:'Химки',AK:true})).toBe(60);
});
it('uses the origin warehouse receipt, not information received or manual delivery dates',()=>{
 const item={CitySender:'Москва',CityReceiver:'Калининград',DatePrih:'2026-10-01',DateArrivalPlan:'2026-10-02',Statuses:[{Stage:'Получена информация',Date:'2026-09-28'},{Stage:'Получена на складе',Date:'2026-10-03'},{Stage:'Получена в KGD',Date:'2026-10-05'}]};
 expect(getWarehouseReceiptDateForSla(item)).toBe('2026-10-03');
 expect(new Date(getSlaPlanDeadlineMs(item)).toISOString()).toBe('2026-10-10T00:00:00.000Z');
 expect(getSlaPlanDeadlineMs({DatePrih:'invalid'})).toBe(0);
 expect(getSlaPlanDeadlineMs({DateArrivalPlan:'2026-10-02'})).toBe(0);
});
