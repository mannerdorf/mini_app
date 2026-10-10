import {describe,it,expect} from 'vitest';
import {forecastAccumulation} from './accumulationForecast';
import {shiftDay,type AccumulationData} from './accumulationModel';
import {VEHICLES,type Vehicle} from '../../../tms/model';
const vehicle:Vehicle={...VEHICLES[0],id:'target',payload:10000,volume:75};
const input=(stockVolume=30,dailyVolume=8):AccumulationData=>({today:'2026-10-10',historyFrom:'2026-09-10',historyTo:'2026-10-09',checkedAt:'2026-10-10T10:00:00Z',undatedDepartures:0,schedule:[],routes:[{route:'MSK → KGD',stock:{weight:stockVolume*100,volume:stockVolume},stockCount:20,stockMissing:0,incoming:Array.from({length:30},(_,i)=>({date:shiftDay('2026-09-10',i),weight:dailyVolume*100,volume:dailyVolume,count:1,missing:0})),outgoing:[]}]});
describe('aggregate stock accumulation',()=>{
 it('adds incoming and subtracts future TC before finding the 80% date',()=>{
  const data=input();data.schedule=[{id:'existing',date:'2026-10-12',route:'MSK → KGD',mode:'auto',vehicleId:'target',vehicleDimensions:{length:4,width:2.5,height:2}}];
  // Use a real preset so the customised 20m³ TC is recognised.
  data.schedule[0].vehicleId='tent';
  const result=forecastAccumulation(data,'MSK → KGD',vehicle)!;
  expect(result.firstDate).toBe('2026-10-17');
  expect(result.points[2].outgoing.volume).toBeCloseTo(20);
  expect(result.points[2].stock.volume).toBeCloseTo(26);
 });
 it('reports readiness even when an existing TC covers it on the same day',()=>{
  const data=input(60,0);data.schedule=[{id:'1',date:data.today,route:'MSK → KGD',mode:'ferry',vehicleId:'40hc'}];
  const result=forecastAccumulation(data,'MSK → KGD',vehicle)!;
  expect(result.firstDate).toBe(data.today);expect(result.events.filter(event=>event.kind==='gap')).toHaveLength(0);
 });
 it('uses weight as the limiting capacity for dense cargo',()=>{
  const data=input(5,0);data.routes[0].stock.weight=9000;
  expect(forecastAccumulation(data,'MSK → KGD',vehicle)?.firstDate).toBe(data.today);
 });
 it('does not fabricate a date when the remaining stock and intake are insufficient',()=>expect(forecastAccumulation(input(5,0),'MSK → KGD',vehicle)?.firstDate).toBeNull());
 it('includes zero-intake days in the 30-day denominator',()=>{
  const data=input(0,0);data.routes[0].incoming[0].volume=240;
  expect(forecastAccumulation(data,'MSK → KGD',vehicle)?.daily.volume).toBe(8);
 });
 it('recommendations do not silently deduct from the stock chart and do not repeat each day',()=>{
  const result=forecastAccumulation(input(150,0),'MSK → KGD',vehicle)!;
  expect(result.events.filter(event=>event.kind==='gap')).toHaveLength(1);
  expect(result.events[0].count).toBe(2);
  expect(result.points[0].stock.volume).toBe(150);
  expect(result.points[5].stock.volume).toBe(150);
 });
 it('marks incomplete incoming or stock data instead of implying a complete forecast',()=>{
  const data=input();data.routes[0].stockMissing=1;
  const result=forecastAccumulation(data,'MSK → KGD',vehicle)!;expect(result.complete).toBe(false);expect(result.events.every(event=>event.partial)).toBe(true);
 });
 it('does not send negative stock or exceed either vehicle limit',()=>{
  const data=input(2,0);data.routes[0].stock.weight=5000;data.schedule=[{id:'1',date:data.today,route:'MSK → KGD',mode:'auto',vehicleId:'tent'}];
  const result=forecastAccumulation(data,'MSK → KGD',vehicle)!;
  expect(result.points[0].stock).toEqual({weight:0,volume:0});
  expect(result.events[0].volume).toBe(2);
  expect(result.events[0].weight).toBe(5000);
 });
});
