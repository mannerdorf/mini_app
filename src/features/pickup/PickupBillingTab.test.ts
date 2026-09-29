import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {PickupBillingTab} from './PickupBillingTab';
let root:ReturnType<typeof create>;
afterEach(()=>{if(root)act(()=>root.unmount());});
const row={jobId:'1',jobNumber:'ZB-1',date:'2026-09-19',customer:'Тест',version:4,amount:100,status:'not_issued',orderNumber:'000123'};
async function mount(call:any){await act(async()=>{root=create(React.createElement(PickupBillingTab,{city:'moscow',date:row.date,jobs:[],routes:[],call}));});}
const issue=()=>root.root.findAllByType('button').find(b=>b.children.includes('Выставить счёт'))!;
it('saves the edited amount before sending with the returned version',async()=>{
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[row]}:b.action==='billing_save'?{ok:true,version:5}:{ok:true,status:'transmitted'});
 await mount(call);
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
it('opens a sandbox without sending and displays diagnostics after one explicit retry',async()=>{
 const result={ok:false,error:'401',diagnostics:{curl:'curl example',status:401,response:'Unauthorized',elapsedMs:12}};
 const call=vi.fn(async(b:any)=>b.action==='billing_journal'?{rows:[{...row,status:'manual'}]}:result);
 await mount(call);
 const button=(label:string)=>root.root.findAllByType('button').find(b=>b.children.includes(label))!;
 await act(async()=>button('Выставить счёт · песочница').props.onClick());
 expect(call.mock.calls).toHaveLength(1);
 await act(async()=>button('Отправить повторно в 1С').props.onClick());
 expect(call).toHaveBeenCalledWith({action:'billing_send',id:'1',version:4,confirmed:true,retry:true});
 expect(JSON.stringify(root.toJSON())).toContain('Unauthorized');
 expect(JSON.stringify(root.toJSON())).toContain('curl example');
 expect(button('Отправить повторно в 1С').props.disabled).toBe(true);
});
