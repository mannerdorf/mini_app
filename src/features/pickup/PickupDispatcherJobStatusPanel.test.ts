import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
vi.mock('./Forms',()=>({Textarea:({value,onChange}:any)=>React.createElement('textarea',{value,onChange:(e:any)=>onChange(e.target.value)})}));
import {PickupDispatcherJobStatusPanel} from './PickupDispatcherJobStatusPanel';
it('requires a request number for warehouse handoff and submits it with the status and version',async()=>{
  const submit=vi.fn().mockResolvedValue(true);
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupDispatcherJobStatusPanel,{job:{id:'j1',version:7,status:'picked_up',actual_places:2,data:{}} as any,busy:false,act:submit}));});
  try {
    await act(async()=>{
      root!.root.findByType('select').props.onChange({target:{value:'deposited'}});
      root!.root.findByType('textarea').props.onChange({target:{value:'Принят складом'}});
    });
    expect(root!.root.findByType('button').props.disabled).toBe(true);
    await act(async()=>root!.root.findByType('input').props.onChange({target:{value:' 000018123 '}}));
    expect(root!.root.findByType('button').props.disabled).toBe(false);
    await act(async()=>root!.root.findByType('button').props.onClick());
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({action:'set_job_status',id:'j1',version:7,status:'deposited',zayavkaNumber:'000018123'}),expect.any(String));
  } finally {await act(async()=>root!.unmount());}
});
