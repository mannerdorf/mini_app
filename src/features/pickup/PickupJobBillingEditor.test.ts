import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
vi.mock('./PickupCustomerQuoteSection',()=>({PickupCustomerQuoteSection:({onPatch}:any)=>React.createElement('button',{onClick:()=>onPatch({issueCustomerBill:true,customerBillMode:'manual',priceRub:500})},'change')}));
import {PickupJobBillingEditor} from './PickupJobBillingEditor';
it('saves billing settings of deposited cargo without changing status or sending to 1C',async()=>{
  const save=vi.fn().mockResolvedValue(true),call=vi.fn();
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobBillingEditor,{job:{id:'j1',version:2,city:'moscow',status:'deposited',data:{issueCustomerBill:false,payment:''}} as any,busy:false,call,act:save}));});
  try {
    await act(async()=>root!.root.findAllByType('button')[0].props.onClick());
    await act(async()=>root!.root.findAllByType('button')[1].props.onClick());
    expect(save).toHaveBeenCalledWith({action:'set_job_billing',id:'j1',version:2,data:expect.objectContaining({issueCustomerBill:true,customerBillMode:'manual',priceRub:500})},expect.any(String));
    expect(call).not.toHaveBeenCalled();
  } finally {await act(async()=>root!.unmount());}
});
