import {expect,it} from 'vitest';
import {pickupInvoiceForTransport, type PickupInvoiceLine} from './pickupInvoices';
const line=(number:string,name:string,transport='000142632',year='2026'):PickupInvoiceLine=>({number,date:`${year}-09-23`,inn:'123',line:{Name:name,Operation:`${name}, перевозка ${transport} от 23.09.${year}`}});
it('selects a separate pickup invoice instead of a main transport invoice',()=>{
 expect(pickupInvoiceForTransport([line('4071','Услуги по перевозке груза'),line('4062','Заборная логистика Москва и МО')],'000142632','2026','123')).toBe('4062');
});
it('rejects other transports, years, customers and ambiguous pickup invoices',()=>{
 const valid=line('4062','Услуги по забору груза');
 expect(pickupInvoiceForTransport([valid],'000142633','2026','123')).toBe('');
 expect(pickupInvoiceForTransport([valid],'000142632','2025','123')).toBe('');
 expect(pickupInvoiceForTransport([valid],'000142632','2026','456')).toBe('');
 expect(pickupInvoiceForTransport([valid,line('4080','Забор')],'000142632','2026','123')).toBe('');
});

it('does not confuse last-mile and pickup service invoices', () => {
 const lines=[{number:'LM-1',date:'2026-10-07',inn:'100',line:{Name:'Услуги последней мили. Перевозка № 000123'}},{number:'ZB-1',date:'2026-10-07',inn:'100',line:{Name:'Забор. Перевозка № 000123'}}];
 expect(pickupInvoiceForTransport(lines,'000123','2026','100','last_mile')).toBe('LM-1');
 expect(pickupInvoiceForTransport(lines,'000123','2026','100')).toBe('ZB-1');
});
