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
 expect(call).toHaveBeenCalledWith({action:'billing_send',id:'1',version:5,confirmed:true,createInvoice:true});
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
 expect(call).toHaveBeenCalledWith({action:'billing_send',id:'1',version:4,confirmed:true,retry:true,createInvoice:true});
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

it('selects a journal invoice and saves its number and date with the reviewed row version',async()=>{
 const open=vi.fn();
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[{...row,status:'issued'}]}:b.action==='billing_invoice_candidates'?{invoices:[{number:'4200',date:'2026-09-18',description:'Услуги по забору груза',amount:1350,transportNumbers:['000142649']}]}:{ok:true});
 await mount(call,open);
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сопоставить счёт'))!.props.onClick());
 expect(root.root.findAllByType('option')[1].children.join('')).toContain('000142649');
 expect(root.root.findAllByType('option')[1].children.join('')).toContain('₽');
 await act(async()=>root.root.findByType('select').props.onChange({target:{value:'0'}}));
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Открыть счёт'))!.props.onClick());
 expect(open).toHaveBeenCalledWith({Number:'4200',Customer:'Тест',_invoiceReferenceDate:'2026-09-18'});
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сопоставить'))!.props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_match_invoice',id:'1',version:4,invoiceNumber:'4200',invoiceDate:'2026-09-18'});
 expect(root.root.findAllByProps({role:'dialog'})).toHaveLength(0);
});

it.each(['manual','uncertain','sending'])('uses invoice matching instead of blind manual confirmation for %s',async(status)=>{
 await mount(vi.fn(async()=>({rows:[{...row,status}]})));
 const buttons=root.root.findAllByType('button');
 expect(buttons.some(b=>b.children.includes('Сопоставить счёт'))).toBe(true);
 expect(buttons.some(b=>b.children.includes('Подтвердить ручное выставление'))).toBe(false);
});

it('searches and matches a missing transport with the job version returned by the server',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[{...row,source:undefined,error:'Перевозка не найдена: нет связи'}]}:b.action==='billing_transport_candidates'?{version:8,transports:[{number:'000123',orderNumber:'000999',date:'2026-09-20',sender:'Отправитель',receiver:'Получатель',places:2,weight:30,volume:1}]}:{ok:true});
 await mount(call);
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сопоставить перевозку'))!.props.onClick());
 await act(async()=>root.root.findByProps({'aria-label':'Перевозка 000123'}).props.onChange({target:{checked:true}}));
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сохранить сопоставление'))!.props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_match_transport',id:'1',jobVersion:8,transportNumber:'000123'});
 expect(root.root.findAllByProps({role:'dialog'})).toHaveLength(0);
});

it.each(['CreatePickupInvoice','SetPickupCost'])('distinguishes an existing invoice response from %s',async(invoiceRequestMethod)=>{
 await mount(vi.fn(async()=>({rows:[{...row,status:'manual',last_error:'счет уже выставлен',invoiceRequestMethod}]})));
 const status=root.root.findByProps({'data-label':'Статус'});
 expect(status.findByType('strong').children.join('')).not.toContain('требуется ручное выставление');
 expect(status.findByType('strong').children.join('')).toContain(invoiceRequestMethod==='CreatePickupInvoice'?'Счёт за забор уже есть':'отклонила изменение стоимости');
 expect(root.root.findAllByType('button').some(b=>b.children.includes('Повторить передачу в 1С'))).toBe(invoiceRequestMethod!=='CreatePickupInvoice');
});

it.each(['manual','uncertain','not_issued'])('hides obsolete transmission actions and errors when an invoice exists (%s)',async(status)=>{
 await mount(vi.fn(async()=>({rows:[{...row,status,invoiceNumber:'4053',last_error:'Ошибка записи счета',source:{mode:'manual'}}]})),vi.fn());
 const buttons=root.root.findAllByType('button');
 expect(buttons.some(b=>b.children.includes('Повторить передачу в 1С')||b.children.includes('Выставить счёт'))).toBe(false);
 expect(JSON.stringify(root.toJSON())).not.toContain('Ошибка записи счета');
 expect(JSON.stringify(root.toJSON())).not.toContain('Не выставлен — ручной расчёт');
 expect(root.root.findByProps({'data-label':'Статус'}).findByType('button')).toBeTruthy();
});

it('keeps matching available for an existing invoice and replaces it without issuing another invoice',async()=>{
 const matched={...row,status:'issued',invoiceNumber:'4200',invoiceReferenceDate:'2026-09-18'};
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[matched]}:b.action==='billing_invoice_candidates'?{invoices:[{number:'4200',date:'2026-09-18',description:'Первый'},{number:'4201',date:'2026-09-19',description:'Второй'}]}:{ok:true});
 await mount(call);
 await act(async()=>root.root.findByProps({'aria-label':'Изменить сопоставление счёта ZB-1'}).props.onClick());
 expect(root.root.findByType('select').props.value).toBe('0');
 await act(async()=>root.root.findByType('select').props.onChange({target:{value:'1'}}));
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сопоставить'))!.props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_match_invoice',id:'1',version:4,invoiceNumber:'4201',invoiceDate:'2026-09-19'});
 expect(call.mock.calls.some(([b])=>b.action==='billing_send'||b.action==='billing_save')).toBe(false);
 expect(root.root.findByProps({'aria-label':'Изменить сопоставление счёта ZB-1'})).toBeTruthy();
});

it('keeps checked transports across search and submits multiple numbers in billing-anchor order',async()=>{
 const a={number:'000001',date:'2026-09-18',orderNumber:'1',sender:'A',receiver:'B'},b={...a,number:'000002'};
 const call=vi.fn(async(x:any)=>x.action==='billing_journal'?{rows:[row]}:x.action==='billing_transport_candidates'?{version:8,transports:x.search?[b]:[a]}:{ok:true});
 await mount(call);
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сопоставить перевозку'))!.props.onClick());
 await act(async()=>root.root.findByProps({'aria-label':'Перевозка 000001'}).props.onChange({target:{checked:true}}));
 await act(async()=>root.root.findByProps({'aria-label':'Поиск перевозки'}).props.onChange({target:{value:'000002'}}));
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Найти'))!.props.onClick());
 expect(root.root.findByProps({'aria-label':'Перевозка 000001'}).props.checked).toBe(true);
 await act(async()=>root.root.findByProps({'aria-label':'Перевозка 000002'}).props.onChange({target:{checked:true}}));
 await act(async()=>root.root.findByProps({'aria-label':'Перевозка для счёта'}).props.onChange({target:{value:'000002'}}));
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Сохранить сопоставление'))!.props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_match_transport',id:'1',jobVersion:8,transportNumbers:['000002','000001']});
 expect(call.mock.calls.some(([b])=>b.action==='billing_send')).toBe(false);
});

it('shows saved cURL and 1C response without retrying the write',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[{...row,status:'uncertain'}]}:{attempts:[{id:'1',createdAt:'2026-10-01T10:00:00Z',method:'CreatePickupInvoice',error:'Ошибка записи счета',diagnostics:{curl:'curl masked',status:500,response:'actual response',elapsedMs:123}}]});
 await mount(call);
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Диагностика 1С'))!.props.onClick());
 expect(call.mock.calls.map(([b])=>b.action)).toEqual(['billing_journal','billing_diagnostics']);
 const rendered=JSON.stringify(root.toJSON());
 expect(rendered).toContain('curl masked');expect(rendered).toContain('actual response');
});
it('shows each transport and its total inside the amount cell',async()=>{
 const call=vi.fn(async()=>({rows:[{...row,amount:3000,matchedTransportNumbers:['000001','000002'],breakdown:[{transportNumber:'000001',amount:1350},{transportNumber:'000002',amount:1650}]}]}));
 await mount(call);
 const cell=root.root.findAllByType('td').find(item=>item.props['data-label']==='Сумма, ₽')!;
 const textOf=(node:any):string=>typeof node==='string'?node:(node.children??[]).map(textOf).join('');
 const content=textOf(cell).replace(/\s/g,' ');
 expect(content).toContain('000001');expect(content).toContain('000002');
 expect(content).toContain('Итого по расчёту: 3 000 ₽');
 expect(content).toContain('1 350 ₽');expect(content).toContain('1 650 ₽');
 expect(root.root.findByProps({'aria-label':'Расчёт перевозок ZB-1'})).toBeTruthy();
});
