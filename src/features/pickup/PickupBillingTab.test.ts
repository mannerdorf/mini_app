import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {PickupBillingTab} from './PickupBillingTab';
let root:ReturnType<typeof create>;
afterEach(()=>{if(root)act(()=>root.unmount());});
const row={jobId:'1',jobNumber:'ZB-1',date:'2026-09-19',customer:'Тест',version:4,amount:100,status:'not_issued',orderNumber:'000123'};
async function mount(call:any,onOpenInvoice?: (invoice:Record<string,unknown>)=>void){await act(async()=>{root=create(React.createElement(PickupBillingTab,{city:'moscow',date:row.date,jobs:[],routes:[],call,onOpenInvoice}));});}
const issue=()=>root.root.findAllByType('button').find(b=>b.children.includes('Выставить счёт'))!;
it('saves the edited amount before sending with the returned version',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[row]}:b.action==='billing_save'?{ok:true,version:5}:{ok:true,status:'transmitted'});
 await mount(call);
 await act(async()=>root.root.findByProps({'aria-label':'Изменить сумму ZB-1'}).props.onClick());
 await act(async()=>root.root.findByProps({'aria-label':'Сумма ZB-1'}).props.onChange({target:{value:'250,50'}}));
 await act(async()=>issue().props.onClick());
 expect(call.mock.calls.map(([b])=>b.action)).toEqual(['billing_journal','billing_save','billing_send','billing_journal']);
 expect(call).toHaveBeenCalledWith({action:'billing_save',id:'1',version:4,amount:250.5});
 expect(call).toHaveBeenCalledWith({action:'billing_send',id:'1',version:5,confirmed:true});
 expect(JSON.stringify(root.toJSON())).not.toContain('Передать стоимость в 1С (');
 expect(root.root.findAllByProps({type:'checkbox'})).toHaveLength(0);
});
it('does not send when saving fails',async()=>{
 const call=vi.fn(async(b:any)=>{if(b.action==='billing_journal')return{rows:[row]};throw new Error('Запись изменилась');});
 await mount(call);await act(async()=>issue().props.onClick());
 expect(call.mock.calls.some(([b])=>b.action==='billing_send')).toBe(false);
 expect(JSON.stringify(root.toJSON())).toContain('Запись изменилась');
});
it('does not retry an uncertain send and refreshes the persisted status',async()=>{
 let status='not_issued';
 const call=vi.fn(async(b:any)=>{if(b.action==='billing_journal')return{rows:[{...row,status}]};if(b.action==='billing_save')return{ok:true,version:5};status='uncertain';throw new Error('timeout');});
 await mount(call);await act(async()=>issue().props.onClick());
 expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(1);
 expect(issue()).toBeUndefined();
 expect(JSON.stringify(root.toJSON())).toContain('сверьте данные в 1С');
});
it('guards repeated clicks while saving',async()=>{
 let finish!:(value:any)=>void;
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[row]}:b.action==='billing_save'?new Promise(r=>{finish=r;}):{ok:true});
 await mount(call);
 const click=issue().props.onClick;
 await act(async()=>{click();click();});
 expect(call.mock.calls.filter(([b])=>b.action==='billing_save')).toHaveLength(1);
 await act(async()=>finish({ok:true,version:5}));
 expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(1);
});
it('shows the order number even without a transport match',async()=>{
 await mount(vi.fn(async()=>({rows:[{...row,source:undefined}]})));
 expect(root.root.findByProps({'data-label':'№ заявки'}).children).toContain('000123');
});
it('offers an explicit retry without a sandbox or a preview request',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[{...row,status:'manual'}]}:{ok:true});
 await mount(call);
 expect(call.mock.calls.map(([b])=>b.action)).toEqual(['billing_journal']);
 const retry=root.root.findAllByType('button').find(b=>b.children.includes('Повторить передачу в 1С'))!;
 await act(async()=>retry.props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_send',id:'1',version:4,confirmed:true,retry:true});
 expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(1);
 expect(call.mock.calls.some(([b])=>b.action==='billing_preview')).toBe(false);
 expect(JSON.stringify(root.toJSON())).not.toContain('Песочница');
});

it('opens the invoice when its number is clicked',async()=>{
 const open=vi.fn();
 await mount(vi.fn(async()=>({rows:[{...row,status:'transmitted',invoiceNumber:'000001529'}]})),open);
 const status=root.root.findByProps({'data-label':'Статус'});
 const stopPropagation=vi.fn();
 await act(async()=>status.findByType('button').props.onClick({stopPropagation}));
 expect(open).toHaveBeenCalledWith({Number:'000001529',Customer:'Тест',_invoiceReferenceDate:row.date});
 expect(stopPropagation).toHaveBeenCalledOnce();
});

it('fills a calculator draft and allows a manual correction before sending',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_quote'?{amount:2448.44}:{rows:[row]});
 await mount(call);
 await act(async()=>root.root.findByProps({'aria-label':'Рассчитать сумму ZB-1'}).props.onClick());
 const amount=()=>root.root.findByProps({'aria-label':'Сумма ZB-1'});
 expect(amount().props.value).toBe('2448');
 await act(async()=>amount().props.onChange({target:{value:'2500'}}));
 expect(amount().props.value).toBe('2500');
 expect(call.mock.calls.map(([b])=>b.action)).toEqual(['billing_journal','billing_quote']);
});
it('preserves the entered amount when calculation fails',async()=>{
 const call=vi.fn(async(b:any)=>{if(b.action==='billing_quote')throw new Error('Нет координат');return {rows:[row]};});
 await mount(call);
 await act(async()=>root.root.findByProps({'aria-label':'Изменить сумму ZB-1'}).props.onClick());
 await act(async()=>root.root.findByProps({'aria-label':'Сумма ZB-1'}).props.onChange({target:{value:'1700'}}));
 await act(async()=>root.root.findByProps({'aria-label':'Рассчитать сумму ZB-1'}).props.onClick());
 expect(root.root.findByProps({'aria-label':'Сумма ZB-1'}).props.value).toBe('1700');
 expect(JSON.stringify(root.toJSON())).toContain('Нет координат');
});

it('shows an existing amount as text and an empty amount as an input',async()=>{
 await mount(vi.fn(async()=>({rows:[row,{...row,jobId:'2',jobNumber:'ZB-2',amount:null}]})));
 expect(root.root.findAllByProps({'aria-label':'Сумма ZB-1'})).toHaveLength(0);
 expect(root.root.findByProps({'aria-label':'Сумма ZB-2'}).props.value).toBe('');
 await act(async()=>root.root.findByProps({'aria-label':'Изменить сумму ZB-1'}).props.onClick());
 expect(root.root.findByProps({'aria-label':'Сумма ZB-1'}).props.value).toBe('100');
 await act(async()=>root.root.findByProps({'aria-label':'Сумма ZB-1'}).props.onBlur());
 expect(root.root.findAllByProps({'aria-label':'Сумма ZB-1'})).toHaveLength(0);
});
it('sorts amounts numerically in both directions with missing values last',async()=>{
 await mount(vi.fn(async()=>({rows:[{...row,jobId:'a',amount:100},{...row,jobId:'b',amount:20},{...row,jobId:'c',amount:null}]})));
 const amounts=()=>root.root.findByType('tbody').findAllByProps({'data-label':'Сумма, ₽'}).map(cell=>cell.findAllByProps({className:'pk-billing-amount-edit'})[0]?.children.join('')??'input');
 const click=()=>root.root.findByProps({'aria-label':'Сортировать: Сумма, ₽'}).props.onClick();
 await act(async()=>click());
 expect(amounts()[0]).toContain('20 ₽');
 expect(root.root.findAllByType('th')[10].props['aria-sort']).toBe('ascending');
 await act(async()=>click());
 expect(amounts()[0]).toContain('100 ₽');
 expect(amounts()[2]).toContain('input');
 expect(root.root.findAllByType('th')[10].props['aria-sort']).toBe('descending');
});
it('sorts customer names and document numbers naturally',async()=>{
 await mount(vi.fn(async()=>({rows:[{...row,jobId:'a',customer:'Я',jobNumber:'ZB-10'},{...row,jobId:'b',customer:'А',jobNumber:'ZB-2'}]})));
 await act(async()=>root.root.findByProps({'aria-label':'Сортировать: Заказчик'}).props.onClick());
 expect(root.root.findByType('tbody').findAllByProps({'data-label':'Заказчик'})[0].children).toEqual(['А']);
 await act(async()=>root.root.findByProps({'aria-label':'Сортировать: № забора'}).props.onClick());
 expect(root.root.findByType('tbody').findAllByProps({'data-label':'№ забора'})[0].findByType('strong').children).toEqual(['ZB-2']);
});
