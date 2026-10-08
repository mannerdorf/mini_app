import {expect,it} from 'vitest';
import * as XLSX from 'xlsx';
import type {TmsCargo} from '../../../tms/model';
import {createPlanningExcel,planningExportRows,type PlanningExport} from './planningExcel';
const cargo=(number:string,customer:string,received:string,paidWeight:number|null):TmsCargo=>({id:number,number,customer,customerId:customer,receiver:'Склад',sender:'Поставщик',received,plannedDeliveryDate:'2026-10-14',slaDeadline:'2026-10-15T12:30:00Z',slaPlanDays:7,route:'MSK → KGD',weight:0,volume:2.5,places:3,paidWeight,readiness:'ready',reason:'',updatedAt:null});
const input:PlanningExport={draft:{date:'2026-10-10',departureDate:'2026-10-14',route:'MSK → KGD',mode:'roro',vehicleId:'tent',ferryId:1,comment:'Указания кладовщику',cargoNumbers:['2','10']},cargo:[cargo('10','Клиент Б','2026-10-08',null),cargo('2','=2+2','2026-10-07',0)],actual:new Set(['10']),ferryName:'FESCO НАВАРИН',view:'customer'};
it('exports every selected cargo once in the displayed hierarchy, with missing values kept blank',()=>{
 for(const view of ['cargo','customer','receiver','date'] as const){const rows=planningExportRows({...input,view});expect(rows.slice(1).map(row=>row[2]).sort()).toEqual(['10','2']);}
 const rows=planningExportRows(input);expect(rows[1].slice(0,3)).toEqual(['=2+2','07.10.2026','2']);expect(rows[1][8]).toBe(0);expect(rows[1][10]).toBe(0);expect(rows[2][10]).toBeNull();
});
it('creates a real xlsx with numeric metrics, date cells, plan metadata and sending facts',async()=>{
 const blob=await createPlanningExcel(input),book=XLSX.read(await blob.arrayBuffer(),{type:'array',cellDates:true});
 expect(book.SheetNames).toEqual(['План','Перевозки']);const sheet=book.Sheets['Перевозки'];
 expect(sheet.C2).toMatchObject({t:'s',v:'2'});expect(sheet.I2).toMatchObject({t:'n',v:0});expect(sheet.J2).toMatchObject({t:'n',v:2.5});expect(sheet.K2).toMatchObject({t:'n',v:0});expect(sheet.K3).toBeUndefined();
 expect(sheet.A2).toMatchObject({t:'s',v:'=2+2'});expect(sheet.A2.f).toBeUndefined();expect(sheet.D2.t).toBe('d');expect(sheet.M3.v).toBe('Отправлена');expect(sheet.N2).toMatchObject({t:'d',v:new Date('2026-10-15T00:00:00Z')});expect(sheet.O2).toMatchObject({t:'n',v:7});
 expect(XLSX.utils.sheet_to_json(book.Sheets['План'],{header:1})).toContainEqual(['Исполнение, %',50]);
});
