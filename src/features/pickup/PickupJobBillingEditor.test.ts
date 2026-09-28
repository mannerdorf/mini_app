import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
vi.mock('./PickupCustomerQuoteSection',()=>({PickupCustomerQuoteSection:({onPatch}:any)=>React.createElement('button',{onClick:()=>onPatch({issueCustomerBill:true,customerBillMode:'manual',priceRub:500})},'change')}));
import {PickupJobBillingEditor} from './PickupJobBillingEditor';
it('autosaves changes without a save button and does not save on mount',async()=>{
  vi.useFakeTimers();
  const save=vi.fn().mockResolvedValue(true),call=vi.fn();
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobBillingEditor,{job:{id:'j1',version:2,city:'moscow',status:'deposited',data:{issueCustomerBill:false,payment:''}} as any,busy:false,call,act:save}));});
  try {
    await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
    expect(save).not.toHaveBeenCalled();
    await act(async()=>root!.root.findByType('button').props.onClick());
    expect(save).not.toHaveBeenCalled();
    await act(async()=>{await vi.advanceTimersByTimeAsync(700);});
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({action:'set_job_billing',id:'j1',version:2,data:expect.objectContaining({issueCustomerBill:true,customerBillMode:'manual',priceRub:500})},expect.any(String));
    expect(JSON.stringify(root!.toJSON())).not.toContain('Сохранить расчёты');
  } finally {await act(async()=>root!.unmount());vi.useRealTimers();}
});
it('shows why editing transmitted billing is disabled',async()=>{
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobBillingEditor,{job:{id:'j1',version:2,city:'moscow',billing_status:'transmitted',data:{issueCustomerBill:true}} as any,busy:false,call:vi.fn(),act:vi.fn()}));});
  try { expect(root!.root.findByType('fieldset').props.disabled).toBe(true);expect(JSON.stringify(root!.toJSON())).toContain('требует сверки'); }
  finally {await act(async()=>root!.unmount());}
});
it('keeps failed edits and retries only on request',async()=>{
  vi.useFakeTimers();
  const save=vi.fn().mockResolvedValue(false);
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobBillingEditor,{job:{id:'j1',version:2,city:'moscow',data:{issueCustomerBill:false}} as any,busy:false,call:vi.fn(),act:save}));});
  try {
    await act(async()=>root!.root.findByType('button').props.onClick());
    await act(async()=>{await vi.advanceTimersByTimeAsync(700);});
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(root!.toJSON())).toContain('Не удалось сохранить изменения');
    save.mockResolvedValue(true);
    await act(async()=>root!.root.findAllByType('button').find(b=>b.children.includes('Повторить сохранение'))!.props.onClick());
    await act(async()=>{await vi.advanceTimersByTimeAsync(700);});
    expect(save).toHaveBeenCalledTimes(2);
  } finally {await act(async()=>root!.unmount());vi.useRealTimers();}
});
