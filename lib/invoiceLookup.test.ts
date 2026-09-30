import {expect,it} from 'vitest';
import {invoiceLookupNumber,selectInvoiceDetail} from './invoiceLookup';
const row={Number:'0000-004157',DateDoc:'2026-09-29T23:59:58',Customer:'Клиент',List:[{Name:'Забор',Sum:1350}]};
it('matches the full 1C number and its displayed form',()=>{expect(invoiceLookupNumber(row.Number)).toBe(invoiceLookupNumber('4157'));});
it('selects the requested year and customer rather than an old same-number invoice',()=>{
 expect(selectInvoiceDetail([{...row,DateDoc:'2025-10-20'},row],{Number:'4157',Customer:'Клиент'},'2026')).toEqual(row);
});
it('does not substitute another customer or year',()=>{
 expect(()=>selectInvoiceDetail([row],{Number:'4157',Customer:'Другой'},'2026')).toThrow('не найден');
 expect(()=>selectInvoiceDetail([row],{Number:'4157'},'2025')).toThrow('не найден');
});
it('does not silently choose an ambiguous invoice',()=>{expect(()=>selectInvoiceDetail([row,{...row,DateDoc:'2026-09-28'}],{Number:'4157'},'2026')).toThrow('несколько');});
it('distinguishes missing details from a truly empty invoice',()=>{
 expect(()=>selectInvoiceDetail([{...row,List:undefined}],{Number:'4157'},'2026')).toThrow('без подробностей');
 expect(selectInvoiceDetail([{...row,List:[]}],{Number:'4157'},'2026').List).toEqual([]);
});
