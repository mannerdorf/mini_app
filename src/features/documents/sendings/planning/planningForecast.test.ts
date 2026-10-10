import {describe,it,expect} from 'vitest';
import {planningGaps,planForecast} from './planningForecast';
import {VEHICLES,type TmsCargo} from '../../../tms/model';
import type {SendingPlan} from './planningModel';
const cargo=(number:string,extra:Partial<TmsCargo>={}):TmsCargo=>({id:number,number,customer:'КА',customerId:'1',receiver:'КА',received:'2026-10-01',route:'MSK → KGD',weight:100,volume:1,places:1,readiness:'ready',reason:'',updatedAt:null,...extra});
const plan=(items:TmsCargo[],extra:Partial<SendingPlan>={}):SendingPlan=>({id:'p',revision:1,date:'2026-10-10',route:'MSK → KGD',mode:'auto',vehicleId:VEHICLES[0].id,ferryId:null,ferryName:'',comment:'',cargo:items,actualCargoNumbers:[],...extra});
describe('calendar forecast overlays',()=>{
 it('uses 80% of limiting weight or volume; never execution percentage',()=>{
  expect(planForecast(plan([cargo('1',{volume:VEHICLES[0].volume*.8})])).level).toBe('ready');
  expect(planForecast(plan([])).level).toBe('low');
  expect(planForecast(plan([cargo('1',{weight:VEHICLES[0].payload*1.01})])).level).toBe('risk');
 });
 it('does not call incomplete metrics, missing TC or late SLA ready',()=>{
  expect(planForecast(plan([cargo('1',{volume:null,weight:VEHICLES[0].payload*.9})])).level).toBe('unknown');
  expect(planForecast(plan([],{mode:'ferry',vehicleId:'40hc',ferryId:null})).level).toBe('risk');
  expect(planForecast(plan([cargo('1',{slaDeadline:'2026-10-09T18:00:00Z'})])).label).toBe('План позже SLA');
 });
 it('anchors unallocated cargo to handover deadlines in Moscow, groups routes and excludes unreceived cargo',()=>{
  const gaps=planningGaps([cargo('1',{slaDeadline:'2026-10-12T22:00:00Z'}),cargo('2',{slaDeadline:'2026-10-13'}),cargo('2'),cargo('3',{readiness:'unreceived'}),cargo('4',{slaDeadline:'2026-10-09'}),cargo('5',{slaDeadline:'bad'})],'2026-10-10');
  expect(gaps.find(g=>g.date==='2026-10-13')?.cargo.map(c=>c.number)).toEqual(['1','2']);
  expect(gaps.find(g=>g.overdue)?.date).toBe('2026-10-10');
  expect(gaps.find(g=>g.unknownDeadline)?.cargo[0].number).toBe('5');
  expect(gaps.flatMap(g=>g.cargo).some(c=>c.number==='3')).toBe(false);
 });
 it('does not manufacture holes for blank days or routes without backlog',()=>expect(planningGaps([],'2026-10-10')).toEqual([]));
});
