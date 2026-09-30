import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
import {PickupDeposit} from './PickupDeposit';
let root:ReturnType<typeof create>;
afterEach(()=>{if(root)act(()=>root.unmount());});
const job:any={id:'job',version:1,status:'picked_up',data:{zayavkaNumber:'',senderName:'Отправитель',customerInn:'100'}};
async function mount(validateOrder:any){await act(async()=>{root=create(React.createElement(PickupDeposit,{jobs:[job],busy:false,disabled:false,error:'',autoOpen:true,onConfirm:vi.fn(async()=>true),validateOrder}));});}
const input=()=>root.root.findByType('input');
const submit=()=>root.root.findAllByType('button').find(b=>b.props.type==='submit')!;
it('requires customer order validation before allowing handoff and invalidates it after an edit',async()=>{
 const validate=vi.fn(async()=>({number:'000123'}));await mount(validate);
 await act(async()=>input().props.onChange({target:{value:'123'}}));
 expect(submit().props.disabled).toBe(true);
 await act(async()=>input().props.onBlur());
 expect(validate).toHaveBeenCalledWith(job,'123');expect(submit().props.disabled).toBe(false);
 await act(async()=>input().props.onChange({target:{value:'124'}}));
 expect(submit().props.disabled).toBe(true);
});
it('displays not found and keeps handoff disabled',async()=>{
 await mount(vi.fn(async()=>{throw new Error('Заявка не найдена');}));
 await act(async()=>input().props.onChange({target:{value:'123'}}));
 await act(async()=>input().props.onBlur());
 expect(root.root.findByProps({role:'alert'}).children).toContain('Заявка не найдена');
 expect(submit().props.disabled).toBe(true);
});
it('ignores a late response for a number already changed by the driver',async()=>{
 let finish!:(value:any)=>void;
 await mount(vi.fn(()=>new Promise(r=>{finish=r;})));
 await act(async()=>input().props.onChange({target:{value:'123'}}));
 act(()=>input().props.onBlur());
 await act(async()=>input().props.onChange({target:{value:'124'}}));
 await act(async()=>finish({number:'000123'}));
 expect(submit().props.disabled).toBe(true);
});
