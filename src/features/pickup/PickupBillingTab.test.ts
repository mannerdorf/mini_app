import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { PickupBillingTab } from './PickupBillingTab';

let root: ReturnType<typeof create>;
afterEach(async () => { if(root) await act(async()=>root.unmount()); vi.unstubAllGlobals(); });
async function setup() {
  let rows = [1,2].map(n=>({jobId:`j${n}`,jobNumber:`ZB-${n}`,customer:'Клиент',date:'2026-09-19',version:1,amount:n*1000,status:'not_issued'}));
  const confirm=vi.fn(()=>false);
  vi.stubGlobal('window',{confirm});
  const call=vi.fn(async (body:any)=>{
    if(body.action==='billing_journal')return {rows:rows.map(r=>({...r}))};
    if(body.action==='billing_save')rows=rows.map(r=>r.jobId===body.id?{...r,amount:body.amount,version:r.version+1}:r);
    return {ok:true};
  });
  await act(async()=>{root=create(React.createElement(PickupBillingTab,{city:'moscow',date:'2026-09-19',call:call as any,jobs:[],routes:[]}));});
  return {call,confirm,changeRemote:()=>{rows=rows.map(r=>r.jobId==='j2'?{...r,amount:2500,version:2}:r);}};
}
const amount=(number:number)=>root.root.findByProps({'aria-label':`Сумма ZB-${number}`});
const select=(number:number)=>root.root.findByProps({'aria-label':`Выбрать ZB-${number}`});
const button=(text:string)=>root.root.findAllByType('button').find(n=>n.children.join('').startsWith(text))!;
it('saving one row preserves another draft and selection, including refresh',async()=>{
  await setup();
  await act(async()=>{amount(1).props.onChange({target:{value:'1111'}});amount(2).props.onChange({target:{value:'2222'}});select(2).props.onChange({target:{checked:true}});});
  await act(async()=>root.root.findAllByType('button').filter(n=>n.children.includes('Сохранить сумму'))[0].props.onClick());
  expect(amount(1).props.value).toBe('1111');expect(amount(2).props.value).toBe('2222');expect(select(2).props.checked).toBe(true);
  await act(async()=>button('Обновить').props.onClick());
  expect(amount(2).props.value).toBe('2222');
});
it('validates drafts before confirmation without invoking 1C or reloading',async()=>{
  const {call,confirm}=await setup();
  await act(async()=>{amount(1).props.onChange({target:{value:'1111'}});select(1).props.onChange({target:{checked:true}});});
  call.mockClear();
  await act(async()=>button('Передать стоимость').props.onClick());
  expect(confirm).not.toHaveBeenCalled();expect(call).not.toHaveBeenCalled();expect(amount(1).props.value).toBe('1111');
  expect(JSON.stringify(root.toJSON())).toContain('Сначала сохраните');
});
it('cancel keeps drafts outside the selected batch and does not reload',async()=>{
  const {call,confirm}=await setup();
  await act(async()=>{amount(2).props.onChange({target:{value:'2222'}});select(1).props.onChange({target:{checked:true}});});
  call.mockClear();await act(async()=>button('Передать стоимость').props.onClick());
  expect(confirm).toHaveBeenCalledOnce();expect(call).not.toHaveBeenCalled();expect(amount(2).props.value).toBe('2222');expect(select(1).props.checked).toBe(true);
});
it('remote version retains draft and requires explicit conflict resolution',async()=>{
  const {changeRemote}=await setup();
  await act(async()=>amount(2).props.onChange({target:{value:'2222'}}));changeRemote();
  await act(async()=>button('Обновить').props.onClick());
  expect(amount(2).props.value).toBe('2222');
  expect(root.root.findAllByType('button').filter(n=>n.children.includes('Сохранить сумму'))[1].props.disabled).toBe(true);
  expect(JSON.stringify(root.toJSON())).toContain('2500');
  await act(async()=>button('Оставить мой ввод').props.onClick());
  expect(root.root.findAllByType('button').filter(n=>n.children.includes('Сохранить сумму'))[1].props.disabled).toBe(false);
});
it('explains a search with no matches and can clear it',async()=>{
  await setup();await act(async()=>root.root.findByProps({placeholder:'Заказчик, забор, перевозка, заявка'}).props.onChange({target:{value:'missing'}}));
  expect(JSON.stringify(root.toJSON())).toContain('ничего не найдено');
  await act(async()=>button('Очистить поиск').props.onClick());expect(amount(1).props.value).toBe('1000');
});

it('sends only selected saved rows, reports partial failure and never claims invoice creation',async()=>{
  const confirm=vi.fn().mockReturnValue(false);vi.stubGlobal('window',{confirm});
  const rows=[1,2].map(n=>({jobId:String(n),jobNumber:`ZB-${n}`,date:'2026-09-17',customer:'Заказчик',version:1,amount:100,status:'not_issued',source:{places:1,weight:2,volume:0.1,chargeableWeight:20,transportNumber:`000${n}`,orderNumber:`order${n}`,mode:'auto'}}));
  const call=vi.fn(async(body:any)=>body.action==='billing_journal'?{rows}:body.id==='1'?{ok:true}:{ok:false,error:'счет уже выставлен'});
  await act(async()=>{root=create(React.createElement(PickupBillingTab,{city:"moscow",date:"2026-09-17",jobs:[],routes:[],call:call as any}));});
  const select=root.root.findAllByType('input').find(i=>i.props['aria-label']==='Выбрать доступные строки')!;
  await act(async()=>select.props.onChange({target:{checked:true}}));
  const button=root.root.findAllByType('button').find(b=>b.children.join('').includes('Передать стоимость'))!;
  await act(async()=>button.props.onClick());
  expect(call.mock.calls.filter(([body])=>body.action==='billing_send')).toHaveLength(0);
  confirm.mockReturnValue(true);
  await act(async()=>select.props.onChange({target:{checked:true}}));
  await act(async()=>button.props.onClick());
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('счета будут выставлены автоматически'));
  expect(call.mock.calls.filter(([body])=>body.action==='billing_send').every(([body])=>body.confirmed===true)).toBe(true);
  expect(call.mock.calls.filter(([body])=>body.action==='billing_send').map(([body])=>body.id)).toEqual(['1','2']);
  const visible=JSON.stringify(root.toJSON());expect(visible).toContain('Передано в 1С: 1');expect(visible).toContain('ZB-2 / 0002');expect(visible).not.toContain('создано 2');
});
it('shows sequential progress and marks lost responses uncertain without an automatic retry',async()=>{
 vi.stubGlobal('window',{confirm:()=>true});let finish!:(v:any)=>void;
 const rows=[1,2].map(n=>({jobId:String(n),jobNumber:`ZB-${n}`,date:'2026-09-19',customer:'Тест',version:1,amount:100,status:'not_issued'}));
 const call=vi.fn(async(body:any)=>{if(body.action==='billing_journal')return{rows};if(body.id==='1')return new Promise(r=>{finish=r;});throw new Error('timeout');});
 await act(async()=>{root=create(React.createElement(PickupBillingTab,{city:'moscow',date:'2026-09-19',jobs:[],routes:[],call:call as any}));});
 await act(async()=>root.root.findByProps({'aria-label':'Выбрать доступные строки'}).props.onChange({target:{checked:true}}));
 act(()=>button('Передать стоимость').props.onClick());
 expect(JSON.stringify(root.toJSON())).toContain('Передаём…');expect(JSON.stringify(root.toJSON())).toContain('Ожидает передачи');
 await act(async()=>finish({ok:true,status:'transmitted'}));
 const output=JSON.stringify(root.toJSON());expect(output).toContain('Передано в 1С');expect(output).toContain('Результат неизвестен');
 expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(2);expect(select(1).props.checked).toBe(false);
});
it('restores persisted outcomes for a ten-row batch without reselecting transmitted or uncertain rows',async()=>{
 vi.stubGlobal('window',{confirm:()=>true});let rows=Array.from({length:10},(_,i)=>({jobId:String(i+1),jobNumber:`ZB-${i+1}`,date:'2026-09-19',customer:'Тест',version:1,amount:100,status:'not_issued'}));
 const call=vi.fn(async(b:any)=>{if(b.action==='billing_journal')return{rows};const status=b.id==='9'?'manual':b.id==='10'?'uncertain':'transmitted';rows=rows.map(r=>r.jobId===b.id?{...r,status,version:2}:r);if(b.id==='10')throw new Error('timeout');return{ok:status==='transmitted',status,error:status==='manual'?'Отказ 1С':undefined};});
 const props={city:'moscow' as const,date:'2026-09-19',jobs:[],routes:[],call:call as any};
 await act(async()=>{root=create(React.createElement(PickupBillingTab,props));});
 await act(async()=>root.root.findByProps({'aria-label':'Выбрать доступные строки'}).props.onChange({target:{checked:true}}));
 await act(async()=>button('Передать стоимость').props.onClick());expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(10);
 await act(async()=>root.unmount());await act(async()=>{root=create(React.createElement(PickupBillingTab,props));});
 expect(select(1).props.disabled).toBe(true);expect(select(10).props.disabled).toBe(true);expect(button('Передать стоимость').props.disabled).toBe(true);
 expect(JSON.stringify(root.toJSON())).toContain('Передача в 1С не подтверждена');expect(call.mock.calls.filter(([b])=>b.action==='billing_send')).toHaveLength(10);
});
